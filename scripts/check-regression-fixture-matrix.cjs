const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const fixtureRoot = path.join(workspaceRoot, 'resources', 'regression', 'fixtures');

const requiredFixtures = [
    'pure_rtl_project',
    'rtl_tb_sva_project',
    'multi_top_project',
    'heuristic_only_project',
    'shared_file_project',
    'filelist_narrow_project'
];

const requiredChecklistTokens = [
    'sources grouping',
    'hierarchy roots',
    'target context resolution',
    'run resolution',
    'diagnostics behavior'
];

const requiredFixtureArtifacts = {
    pure_rtl_project: [
        'rtl/dut.sv',
        '.hdl-helper/project.json'
    ],
    rtl_tb_sva_project: [
        'rtl/dut.sv',
        'tb/tb_top.sv',
        'sva/handshake_sva.sv',
        '.hdl-helper/project.json'
    ],
    multi_top_project: [
        'rtl/core_a.sv',
        'rtl/core_b.sv',
        'tb/tb_a.sv',
        'tb/tb_b.sv',
        '.hdl-helper/project.json'
    ],
    heuristic_only_project: [
        'rtl/dut.sv',
        'tb/tb_top.sv'
    ],
    shared_file_project: [
        'common/bus_pkg.sv',
        'rtl/dut.sv',
        'tb/tb_shared.sv',
        '.hdl-helper/project.json'
    ],
    filelist_narrow_project: [
        'rtl/dut.sv',
        'rtl/debug_stub.sv',
        'tb/tb_top.sv',
        'sim/sim.f',
        '.hdl-helper/project.json'
    ]
};

const fixtureForbiddenArtifacts = {
    heuristic_only_project: ['.hdl-helper/project.json']
};

function pushUnique(errors, message) {
    if (!errors.includes(message)) {
        errors.push(message);
    }
}

function main() {
    const errors = [];

    if (!fs.existsSync(fixtureRoot)) {
        pushUnique(errors, `Fixture root directory is missing: ${fixtureRoot}`);
    }

    for (const fixtureName of requiredFixtures) {
        const fixtureDir = path.join(fixtureRoot, fixtureName);
        const fixtureReadme = path.join(fixtureDir, 'README.md');

        if (!fs.existsSync(fixtureDir) || !fs.statSync(fixtureDir).isDirectory()) {
            pushUnique(errors, `Missing required fixture directory: resources/regression/fixtures/${fixtureName}`);
            continue;
        }

        if (!fs.existsSync(fixtureReadme)) {
            pushUnique(errors, `Missing fixture README: resources/regression/fixtures/${fixtureName}/README.md`);
            continue;
        }

        let readmeContent = '';
        try {
            readmeContent = fs.readFileSync(fixtureReadme, 'utf8').toLowerCase();
        } catch {
            pushUnique(errors, `Unable to read fixture README: resources/regression/fixtures/${fixtureName}/README.md`);
            continue;
        }

        const missingTokens = requiredChecklistTokens.filter(token => !readmeContent.includes(token));
        if (missingTokens.length > 0) {
            pushUnique(
                errors,
                `Fixture '${fixtureName}' README missing checklist coverage tokens: ${missingTokens.join(', ')}`
            );
        }

        const requiredArtifacts = requiredFixtureArtifacts[fixtureName] || [];
        for (const relativePath of requiredArtifacts) {
            const artifactPath = path.join(fixtureDir, relativePath);
            if (!fs.existsSync(artifactPath)) {
                pushUnique(
                    errors,
                    `Fixture '${fixtureName}' missing required artifact: resources/regression/fixtures/${fixtureName}/${relativePath}`
                );
            }
        }

        const forbiddenArtifacts = fixtureForbiddenArtifacts[fixtureName] || [];
        for (const relativePath of forbiddenArtifacts) {
            const artifactPath = path.join(fixtureDir, relativePath);
            if (fs.existsSync(artifactPath)) {
                pushUnique(
                    errors,
                    `Fixture '${fixtureName}' should not contain artifact: resources/regression/fixtures/${fixtureName}/${relativePath}`
                );
            }
        }
    }

    if (errors.length > 0) {
        console.error('[fixture-matrix] Fixture matrix check failed with issues:');
        for (const issue of errors) {
            console.error(`  - ${issue}`);
        }
        process.exit(1);
    }

    console.log('[fixture-matrix] Fixture matrix check passed.');
}

main();
