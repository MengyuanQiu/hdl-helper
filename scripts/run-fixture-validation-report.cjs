const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const workspaceRoot = process.cwd();
const fixtureRoot = path.join(workspaceRoot, 'resources', 'regression', 'fixtures');
const integrityScriptPath = path.join(__dirname, 'check-project-config-integrity.cjs');
const reportPath = path.join(workspaceRoot, 'resources', 'regression', 'FIXTURE_VALIDATION_REPORT_2026-04-12.md');

const fixtureNames = [
    'pure_rtl_project',
    'rtl_tb_sva_project',
    'multi_top_project',
    'heuristic_only_project',
    'shared_file_project',
    'filelist_narrow_project'
];

function runIntegrityGate(fixtureDir) {
    try {
        const output = cp.execFileSync(process.execPath, [integrityScriptPath], {
            cwd: fixtureDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { ok: true, output: String(output || '').trim() };
    } catch (error) {
        const stderr = error && error.stderr ? String(error.stderr).trim() : '';
        const stdout = error && error.stdout ? String(error.stdout).trim() : '';
        return { ok: false, output: stderr || stdout || String(error) };
    }
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return undefined;
    }
}

function hasAnySvFile(dirPath) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return false;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory() && hasAnySvFile(fullPath)) {
            return true;
        }
        if (entry.isFile() && entry.name.endsWith('.sv')) {
            return true;
        }
    }

    return false;
}

function evaluateFixture(fixtureName) {
    const fixtureDir = path.join(fixtureRoot, fixtureName);
    const configPath = path.join(fixtureDir, '.hdl-helper', 'project.json');
    const config = readJsonIfExists(configPath);
    const integrity = runIntegrityGate(fixtureDir);

    const isHeuristicOnly = fixtureName === 'heuristic_only_project';

    const hasSourcesGrouping = isHeuristicOnly
        ? hasAnySvFile(path.join(fixtureDir, 'rtl')) || hasAnySvFile(path.join(fixtureDir, 'tb'))
        : Boolean(config && config.sourceSets && Object.keys(config.sourceSets).length > 0);

    const hasHierarchyRoots = isHeuristicOnly
        ? hasAnySvFile(path.join(fixtureDir, 'rtl'))
        : Boolean(config && config.tops && (config.tops.design || config.tops.simulation));

    const hasTargetContextResolution = isHeuristicOnly
        ? integrity.ok && integrity.output.includes('No .hdl-helper/project.json found')
        : integrity.ok;

    const hasRunResolution = isHeuristicOnly
        ? hasAnySvFile(path.join(fixtureDir, 'tb'))
        : Boolean(
            config
            && config.targets
            && Object.values(config.targets).some(target => target && target.kind === 'simulation')
        );

    const hasDiagnosticsBehavior = isHeuristicOnly
        ? integrity.ok && integrity.output.includes('No .hdl-helper/project.json found')
        : integrity.ok && integrity.output.includes('Integrity check passed');

    return {
        fixtureName,
        hasSourcesGrouping,
        hasHierarchyRoots,
        hasTargetContextResolution,
        hasRunResolution,
        hasDiagnosticsBehavior,
        integrityOutput: integrity.output
    };
}

function main() {
    const results = fixtureNames.map(evaluateFixture);
    const failures = [];

    const lines = [];
    lines.push('# Fixture Validation Report (Day54)');
    lines.push('');
    lines.push('Date: 2026-04-12');
    lines.push('Scope: Iteration 6 final fixture checklist closure');
    lines.push('');

    for (const result of results) {
        lines.push(`## ${result.fixtureName}`);
        lines.push(`- [${result.hasSourcesGrouping ? 'x' : ' '}] sources grouping`);
        lines.push(`- [${result.hasHierarchyRoots ? 'x' : ' '}] hierarchy roots`);
        lines.push(`- [${result.hasTargetContextResolution ? 'x' : ' '}] target context resolution`);
        lines.push(`- [${result.hasRunResolution ? 'x' : ' '}] run resolution`);
        lines.push(`- [${result.hasDiagnosticsBehavior ? 'x' : ' '}] diagnostics behavior`);
        lines.push(`- integrity output: ${result.integrityOutput || '(none)'}`);
        lines.push('');

        if (!result.hasSourcesGrouping) {
            failures.push(`${result.fixtureName}: sources grouping evidence missing`);
        }
        if (!result.hasHierarchyRoots) {
            failures.push(`${result.fixtureName}: hierarchy roots evidence missing`);
        }
        if (!result.hasTargetContextResolution) {
            failures.push(`${result.fixtureName}: target context resolution evidence missing`);
        }
        if (!result.hasRunResolution) {
            failures.push(`${result.fixtureName}: run resolution evidence missing`);
        }
        if (!result.hasDiagnosticsBehavior) {
            failures.push(`${result.fixtureName}: diagnostics behavior evidence missing`);
        }
    }

    lines.push('## Summary');
    if (failures.length === 0) {
        lines.push('- Overall: passed');
        lines.push('- Result: all fixture checklist dimensions are covered by first-pass evidence.');
    } else {
        lines.push('- Overall: failed');
        lines.push(`- Failure count: ${failures.length}`);
        for (const failure of failures) {
            lines.push(`- ${failure}`);
        }
    }

    fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

    if (failures.length > 0) {
        console.error('[fixture-validation] Fixture validation failed.');
        console.error(`[fixture-validation] Report: ${reportPath}`);
        process.exit(1);
    }

    console.log('[fixture-validation] Fixture validation passed.');
    console.log(`[fixture-validation] Report: ${reportPath}`);
}

main();
