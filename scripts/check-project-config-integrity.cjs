const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, '.hdl-helper', 'project.json');
const ignoredDirs = new Set(['.git', 'node_modules', 'out', '.vscode-test']);

function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasGlob(pattern) {
    return /[*?[\]{}]/.test(pattern);
}

function toPosixPath(value) {
    return value.replace(/\\/g, '/');
}

function toAbsPath(base, maybeRelative) {
    return path.isAbsolute(maybeRelative) ? maybeRelative : path.join(base, maybeRelative);
}

function pushError(errors, message) {
    if (!errors.includes(message)) {
        errors.push(message);
    }
}

function getWorkspaceFiles(rootDir) {
    const files = [];
    const stack = [rootDir];

    while (stack.length > 0) {
        const current = stack.pop();
        let entries;

        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (ignoredDirs.has(entry.name)) {
                    continue;
                }
                stack.push(fullPath);
                continue;
            }

            if (entry.isFile()) {
                files.push(path.normalize(fullPath));
            }
        }
    }

    return files;
}

function globMatch(targetPath, pattern) {
    if (!pattern) {
        return false;
    }

    const parts = pattern.split(/(\*\*\/|\*\*|\*|\?)/g);
    const regex = parts.map(part => {
        if (part === '**/') {
            return '(?:.*/)?';
        }
        if (part === '**') {
            return '.*';
        }
        if (part === '*') {
            return '[^/]*';
        }
        if (part === '?') {
            return '[^/]';
        }
        return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }).join('');

    return new RegExp(`^${regex}$`).test(targetPath);
}

function matchesPattern(relativePath, absolutePath, pattern) {
    const normalizedPattern = toPosixPath(pattern);
    const normalizedRelative = toPosixPath(relativePath);
    const normalizedAbsolute = toPosixPath(absolutePath);

    if (normalizedPattern.startsWith('/')) {
        return globMatch(normalizedAbsolute, normalizedPattern);
    }

    return globMatch(normalizedRelative, normalizedPattern)
        || globMatch(normalizedAbsolute, normalizedPattern);
}

function matchesSourceSet(relativePath, absolutePath, includes, excludes) {
    const included = includes.some(pattern => matchesPattern(relativePath, absolutePath, pattern));
    if (!included) {
        return false;
    }

    if (!Array.isArray(excludes) || excludes.length === 0) {
        return true;
    }

    return !excludes.some(pattern => matchesPattern(relativePath, absolutePath, pattern));
}

function resolveSourceSetFiles(sourceSet, workspaceFiles, rootDir) {
    const includes = Array.isArray(sourceSet.includes) ? sourceSet.includes : [];
    const excludes = Array.isArray(sourceSet.excludes) ? sourceSet.excludes : [];

    return workspaceFiles.filter(filePath => {
        const relativePath = toPosixPath(path.relative(rootDir, filePath));
        return matchesSourceSet(relativePath, filePath, includes, excludes);
    });
}

function validateConfig(raw, rootDir, errors) {
    if (!isObject(raw)) {
        pushError(errors, 'project.json must be a JSON object.');
        return;
    }

    if (typeof raw.version !== 'string' || raw.version.trim().length === 0) {
        pushError(errors, 'Missing required field: version');
    }
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
        pushError(errors, 'Missing required field: name');
    }

    if (!isObject(raw.sourceSets) || Object.keys(raw.sourceSets).length === 0) {
        pushError(errors, 'Missing required field: sourceSets');
    }

    if (!isObject(raw.targets) || Object.keys(raw.targets).length === 0) {
        pushError(errors, 'Missing required field: targets');
    }

    if (!isObject(raw.sourceSets) || !isObject(raw.targets)) {
        return;
    }

    const validTargetKinds = new Set(['design', 'simulation', 'synthesis', 'implementation']);
    const workspaceFiles = getWorkspaceFiles(rootDir);
    const sourceSetResolvedFiles = {};

    for (const [setName, sourceSet] of Object.entries(raw.sourceSets)) {
        if (!isObject(sourceSet)) {
            pushError(errors, `Source set '${setName}' must be an object.`);
            continue;
        }

        if (!Array.isArray(sourceSet.includes) || sourceSet.includes.length === 0) {
            pushError(errors, `Source set '${setName}' missing required field: includes`);
            continue;
        }

        for (const includePattern of sourceSet.includes) {
            if (typeof includePattern !== 'string' || includePattern.trim().length === 0) {
                pushError(errors, `Source set '${setName}' contains invalid include pattern.`);
                continue;
            }

            if (!hasGlob(includePattern)) {
                const includePath = toAbsPath(rootDir, includePattern);
                if (!fs.existsSync(includePath)) {
                    pushError(errors, `Source set '${setName}' references missing include path: ${includePattern}`);
                }
            }
        }

        const resolvedFiles = resolveSourceSetFiles(sourceSet, workspaceFiles, rootDir);
        sourceSetResolvedFiles[setName] = resolvedFiles;
        if (resolvedFiles.length === 0) {
            pushError(errors, `Source set '${setName}' resolves to zero files.`);
        }
    }

    for (const [targetId, target] of Object.entries(raw.targets)) {
        if (!isObject(target)) {
            pushError(errors, `Target '${targetId}' must be an object.`);
            continue;
        }

        if (typeof target.kind !== 'string' || !validTargetKinds.has(target.kind)) {
            pushError(errors, `Target '${targetId}' has invalid kind: ${String(target.kind || '')}`);
        }

        if (!Array.isArray(target.sourceSets) || target.sourceSets.length === 0) {
            pushError(errors, `Target '${targetId}' missing required field: sourceSets`);
        } else {
            const resolvedTargetFiles = new Set();
            for (const sourceSetName of target.sourceSets) {
                if (!raw.sourceSets[sourceSetName]) {
                    pushError(errors, `Target '${targetId}' references unknown source set: ${sourceSetName}`);
                    continue;
                }

                const filesInSet = sourceSetResolvedFiles[sourceSetName] || [];
                filesInSet.forEach(filePath => resolvedTargetFiles.add(filePath));
            }

            if (resolvedTargetFiles.size === 0) {
                pushError(errors, `Target '${targetId}' resolves empty files from sourceSets.`);
            }
        }

        if (target.filelist) {
            if (typeof target.filelist !== 'string' || target.filelist.trim().length === 0) {
                pushError(errors, `Target '${targetId}' has invalid filelist value.`);
            } else {
                const filelistPath = toAbsPath(rootDir, target.filelist);
                if (!fs.existsSync(filelistPath)) {
                    pushError(errors, `Target '${targetId}' references missing filelist: ${target.filelist}`);
                }
            }
        }
    }

    if (raw.activeTarget && !raw.targets[raw.activeTarget]) {
        pushError(errors, `Active target '${raw.activeTarget}' not found in targets`);
    }
}

function main() {
    if (!fs.existsSync(configPath)) {
        console.log('[project-config-integrity] No .hdl-helper/project.json found. Skipping integrity checks.');
        process.exit(0);
    }

    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.error('[project-config-integrity] Failed to parse .hdl-helper/project.json');
        console.error(String(error));
        process.exit(1);
    }

    const errors = [];
    validateConfig(raw, workspaceRoot, errors);

    if (errors.length > 0) {
        console.error('[project-config-integrity] Integrity check failed with issues:');
        for (const issue of errors) {
            console.error(`  - ${issue}`);
        }
        process.exit(1);
    }

    console.log('[project-config-integrity] Integrity check passed.');
}

main();
