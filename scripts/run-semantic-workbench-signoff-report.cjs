const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const regressionRoot = path.join(workspaceRoot, 'resources', 'regression');
const releaseNotesPath = path.join(workspaceRoot, 'RELEASE_NOTES_V3.2.0.md');
const signoffReportPath = path.join(regressionRoot, 'SEMANTIC_WORKBENCH_SIGNOFF_2026-04-12.md');

const requiredReports = [
    'FIXTURE_SANITY_REPORT_2026-04-12.md',
    'DEBUG_COMMANDS_SANITY_REPORT_2026-04-12.md',
    'FIXTURE_VALIDATION_REPORT_2026-04-12.md'
];

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function pushUnique(errors, message) {
    if (!errors.includes(message)) {
        errors.push(message);
    }
}

function main() {
    const errors = [];
    const lines = [];

    lines.push('# Semantic Workbench Signoff Report (Day54)');
    lines.push('');
    lines.push('Date: 2026-04-12');
    lines.push('Owner: HDL Helper Core Team');
    lines.push('Scope: Iteration 6 final release closure');
    lines.push('');

    lines.push('## Evidence Checks');
    for (const reportName of requiredReports) {
        const reportPath = path.join(regressionRoot, reportName);
        const exists = fs.existsSync(reportPath);
        let passed = false;

        if (!exists) {
            pushUnique(errors, `Missing required evidence report: resources/regression/${reportName}`);
        } else {
            const content = readText(reportPath);
            passed = content.includes('Overall: passed');
            if (!passed) {
                pushUnique(errors, `Evidence report does not indicate pass: resources/regression/${reportName}`);
            }
        }

        lines.push(`- ${reportName}: ${exists ? (passed ? 'passed' : 'failed') : 'missing'}`);
    }

    const releaseNotesExists = fs.existsSync(releaseNotesPath);
    let releaseNotesHasGateStatus = false;
    if (releaseNotesExists) {
        const releaseNotes = readText(releaseNotesPath);
        releaseNotesHasGateStatus = releaseNotes.includes('Semantic Workbench Gate Status (2026-04-12)');
        if (!releaseNotesHasGateStatus) {
            pushUnique(errors, 'Release notes missing semantic workbench gate status section.');
        }
    } else {
        pushUnique(errors, 'Release notes file missing: RELEASE_NOTES_V3.2.0.md');
    }

    lines.push(`- RELEASE_NOTES_V3.2.0.md gate status section: ${releaseNotesHasGateStatus ? 'present' : 'missing'}`);
    lines.push('');

    lines.push('## Triage');
    if (errors.length === 0) {
        lines.push('- Open blocking issues: none');
        lines.push('- Triage status: completed');
    } else {
        lines.push(`- Open blocking issues: ${errors.length}`);
        for (const error of errors) {
            lines.push(`- ${error}`);
        }
    }

    lines.push('');
    lines.push('## Decision');
    lines.push(`- Final status: ${errors.length === 0 ? 'ready' : 'blocked'}`);

    fs.writeFileSync(signoffReportPath, `${lines.join('\n')}\n`, 'utf8');

    if (errors.length > 0) {
        console.error('[semantic-signoff] Signoff checks failed.');
        console.error(`[semantic-signoff] Report: ${signoffReportPath}`);
        process.exit(1);
    }

    console.log('[semantic-signoff] Signoff checks passed.');
    console.log(`[semantic-signoff] Report: ${signoffReportPath}`);
}

main();
