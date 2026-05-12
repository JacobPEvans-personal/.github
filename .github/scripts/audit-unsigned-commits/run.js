// Weekly cross-org sweep: scan default branches of every repo in JacobPEvans +
// dryvist (plus the JacobPEvans/JacobPEvans output branch where the profile
// deploy commits live) for commits in the last AUDIT_WINDOW_DAYS that don't
// have GitHub-verified signatures. If any are found, post a compact summary to
// Slack and fail the job so the Actions tab shows red.
//
// This is the canary behind rulesets + the PR-level CI gate + the pre-commit
// hook. If any future regression makes it through all three earlier layers,
// this catches it within at most AUDIT_WINDOW_DAYS days.
//
// Env (set on the calling step):
//   ORGS                    Comma-separated list of orgs/users to sweep
//   AUDIT_WINDOW_DAYS       Lookback window in days (integer)
//   EXTRA_BRANCHES          Optional JSON of {"<owner>/<repo>": ["branch1", ...]}
//                           — non-default branches to also audit (e.g. profile output)
//   SLACK_WEBHOOK_URL       Slack Incoming Webhook (no auth header required)
//   SLACK_CHANNEL_NAME      For the message title only (cosmetic)

const ORGS = (process.env.ORGS || 'JacobPEvans,dryvist')
  .split(',').map((s) => s.trim()).filter(Boolean);
const AUDIT_WINDOW_DAYS = Number.parseInt(process.env.AUDIT_WINDOW_DAYS || '7', 10);
const EXTRA_BRANCHES = JSON.parse(process.env.EXTRA_BRANCHES || '{}');
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME || '#github-ci-failures';

async function listRepos(github, owner) {
  // Repos owned by the user or org. Includes both public and private repos
  // visible to the authenticated token. Excludes archived (no new commits).
  try {
    return await github.paginate(github.rest.repos.listForUser, {
      username: owner, per_page: 100, type: 'owner',
    }).then((repos) => repos.filter((r) => !r.archived));
  } catch {
    return await github.paginate(github.rest.repos.listForOrg, {
      org: owner, per_page: 100,
    }).then((repos) => repos.filter((r) => !r.archived));
  }
}

async function listUnsignedCommitsOnBranch(github, owner, repo, branch, since) {
  let commits;
  try {
    commits = await github.paginate(github.rest.repos.listCommits, {
      owner, repo, sha: branch, since, per_page: 100,
    });
  } catch (err) {
    if (err.status === 404 || err.status === 409) {
      // 404: branch doesn't exist on this repo. 409: empty repo.
      return [];
    }
    throw err;
  }
  return commits.filter((c) => c.commit.verification && c.commit.verification.verified === false);
}

async function postSlack(message) {
  if (!SLACK_WEBHOOK_URL) {
    return;
  }
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack post failed: ${res.status} ${body}`);
  }
}

module.exports = async ({ github, core }) => {
  const since = new Date(Date.now() - AUDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  core.info(`Audit window: commits since ${since}`);

  const offenders = [];
  for (const owner of ORGS) {
    core.info(`--- ${owner} ---`);
    const repos = await listRepos(github, owner);
    core.info(`  ${repos.length} active (non-archived) repos`);

    for (const r of repos) {
      const branchesToCheck = new Set([r.default_branch]);
      const extras = EXTRA_BRANCHES[`${owner}/${r.name}`];
      if (Array.isArray(extras)) {
        for (const b of extras) {
          branchesToCheck.add(b);
        }
      }

      for (const branch of branchesToCheck) {
        if (!branch) {
          continue;
        }
        const unsigned = await listUnsignedCommitsOnBranch(github, owner, r.name, branch, since);
        for (const c of unsigned) {
          offenders.push({
            owner,
            repo: r.name,
            branch,
            sha: c.sha,
            author: c.commit.author && c.commit.author.name,
            reason: c.commit.verification.reason,
            date: c.commit.author && c.commit.author.date,
            url: c.html_url,
          });
        }
      }
    }
  }

  // Summary table for the Actions tab.
  const summary = core.summary
    .addHeading(`Unsigned-commits audit — ${AUDIT_WINDOW_DAYS}-day window`, 2)
    .addRaw(`<p>Scanned ${ORGS.join(', ')}, window since ${since}.</p>`);

  if (offenders.length === 0) {
    summary.addRaw('<p><strong>No unsigned commits found.</strong> All automated and human commits in the window are GitHub-verified.</p>').write();
    core.info('No unsigned commits detected. Audit passes.');
    return;
  }

  const rows = [
    [
      { data: 'Repo', header: true },
      { data: 'Branch', header: true },
      { data: 'SHA', header: true },
      { data: 'Author', header: true },
      { data: 'Reason', header: true },
      { data: 'Date', header: true },
    ],
    ...offenders.map((o) => [
      `${o.owner}/${o.repo}`,
      o.branch,
      `[${o.sha.slice(0, 8)}](${o.url})`,
      o.author || '(unknown)',
      o.reason || '(unknown)',
      o.date || '(unknown)',
    ]),
  ];
  await summary.addHeading(`${offenders.length} unsigned commit(s) found`, 3).addTable(rows).write();

  // Slack alert.
  const linesForSlack = offenders
    .slice(0, 20)
    .map((o) => `• <${o.url}|${o.owner}/${o.repo}@${o.sha.slice(0, 8)}> on \`${o.branch}\` — ${o.author || '?'} (${o.reason || '?'})`);
  const more = offenders.length > 20 ? `\n…and ${offenders.length - 20} more` : '';
  const msg = `*Unsigned-commits audit ${SLACK_CHANNEL_NAME} alert*\n${offenders.length} unsigned commit(s) detected in the last ${AUDIT_WINDOW_DAYS} days across ${ORGS.join(' + ')}.\n\n${linesForSlack.join('\n')}${more}\n\nSee the workflow summary for the full table.`;
  await postSlack(msg);

  core.setFailed(`${offenders.length} unsigned commit(s) detected in the audit window — see job summary and ${SLACK_CHANNEL_NAME} for details.`);
};
