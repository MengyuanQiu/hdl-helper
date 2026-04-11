import * as fs from 'fs';
import * as path from 'path';

export interface FilelistParseResult {
    sourceFiles: string[];
    includeDirs: string[];
    libraryDirs: string[];
}

export class FilelistParser {
    private static expandEnvVars(input: string): string {
        return input.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)|%([^%]+)%/g, (match, p1, p2, p3) => {
            const varName = p1 || p2 || p3;
            const value = process.env[varName];
            return value !== undefined ? value : match;
        });
    }

    /**
     * 解析 .f 文件，返回绝对路径列表
     * @param fFilePath .f 文件的绝对路径
     */
    public static parse(fFilePath: string): string[] {
        return this.parseDetailed(fFilePath).sourceFiles;
    }

    /**
     * 解析 filelist，返回源文件、include 目录与库目录。
     */
    public static parseDetailed(fFilePath: string, visited = new Set<string>()): FilelistParseResult {
        const result: FilelistParseResult = {
            sourceFiles: [],
            includeDirs: [],
            libraryDirs: []
        };

        if (!fFilePath) {
            return result;
        }

        const absFilelist = path.resolve(fFilePath);
        if (!fs.existsSync(absFilelist) || visited.has(absFilelist)) {
            return result;
        }
        visited.add(absFilelist);

        const sourceSet = new Set<string>();
        const includeSet = new Set<string>();
        const librarySet = new Set<string>();

        const content = fs.readFileSync(absFilelist, 'utf-8');
        const lines = content.split(/\r?\n/);
        const rootDir = path.dirname(absFilelist);

        const toAbs = (rawPath: string): string => {
            return path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, rawPath);
        };

        for (let line of lines) {
            line = line.trim();
            if (!line) {
                continue;
            }

            if (line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) {
                continue;
            }

            const slashComment = line.indexOf('//');
            if (slashComment !== -1) {
                line = line.substring(0, slashComment).trim();
            }

            if (!line) {
                continue;
            }

            line = this.expandEnvVars(line);

            if (line.startsWith('+incdir+')) {
                const parts = line.split('+').slice(2).map(p => p.trim()).filter(Boolean);
                for (const dir of parts) {
                    const absDir = toAbs(this.expandEnvVars(dir));
                    if (fs.existsSync(absDir)) {
                        includeSet.add(absDir);
                    }
                }
                continue;
            }

            if (line.startsWith('-f ') || line.startsWith('-F ')) {
                const nestedRaw = line.substring(2).trim();
                if (nestedRaw) {
                    const nestedAbs = toAbs(nestedRaw);
                    const nested = this.parseDetailed(nestedAbs, visited);
                    nested.sourceFiles.forEach(f => sourceSet.add(f));
                    nested.includeDirs.forEach(d => includeSet.add(d));
                    nested.libraryDirs.forEach(d => librarySet.add(d));
                }
                continue;
            }

            if (line.startsWith('-y ')) {
                const libRaw = line.substring(2).trim();
                if (libRaw) {
                    const libAbs = toAbs(libRaw);
                    if (fs.existsSync(libAbs)) {
                        librarySet.add(libAbs);
                    }
                }
                continue;
            }

            if (line.startsWith('-v ')) {
                const fileRaw = line.substring(2).trim();
                if (fileRaw) {
                    const fileAbs = toAbs(fileRaw);
                    if (fs.existsSync(fileAbs) && /\.(v|sv|vh|svh)$/i.test(fileAbs)) {
                        sourceSet.add(fileAbs);
                    }
                }
                continue;
            }

            if (line.startsWith('+') || line.startsWith('-')) {
                continue;
            }

            const absPath = toAbs(line);
            if (fs.existsSync(absPath) && /\.(v|sv|vh|svh)$/i.test(absPath)) {
                sourceSet.add(absPath);
            }
        }

        result.sourceFiles = Array.from(sourceSet).sort((a, b) => a.localeCompare(b));
        result.includeDirs = Array.from(includeSet).sort((a, b) => a.localeCompare(b));
        result.libraryDirs = Array.from(librarySet).sort((a, b) => a.localeCompare(b));
        return result;
    }
}