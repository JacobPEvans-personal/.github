// Fails the calling workflow when any commit in the active pull request is not
// verified by GitHub (GPG, S/MIME, or SSH signature). Designed to be invoked
// from `_signed-commits-check.yml` via `actions/github-script`. The reusable
// workflow sparse-checks this file out of JacobPEvans/.github@main into
// `./.gh-shared/.github/scripts/` on the consumer's runner, so the require()
// path the workflow uses is:
//
//   const run = require('./.gh-shared/.github/scripts/signed-commits-check.js');
//   await run({ github, context, core });
//
// When running inside this repo's own CI (e.g. the dogfood gate), the script
// is in-tree, so the path without the `.gh-shared/` prefix also works.
//
// Why this lives in a dedicated file: no off-the-shelf action exists for the
// "fail-PR-on-any-unsigned-commit" check, and the pagination + filter + summary
// logic would balloon past the no-scripts inline limit if buried in YAML.

module.exports = async ({ github, context, core }) => {
  const pr = context.payload.pull_request;
  if (!pr) {
    core.info('No pull_request payload present; skipping signed-commits check.');
    return;
  }

  const { owner, repo } = context.repo;
  const commits = await github.paginate(github.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: pr.number,
    per_page: 100,
  });

  const unsigned = commits.filter((c) => c.commit.verification.verified === false);

  if (unsigned.length === 0) {
    core.info(`All ${commits.length} commit(s) in PR #${pr.number} are verified.`);
    await core.summary
      .addHeading('Signed commits check', 2)
      .addRaw(`All ${commits.length} commit(s) verified.`)
      .write();
    return;
  }

  const rows = unsigned.map((c) => [
    c.sha.slice(0, 8),
    c.commit.author.name || '(unknown)',
    c.commit.verification.reason || '(no reason reported)',
  ]);

  await core.summary
    .addHeading('Unsigned commits detected', 2)
    .addRaw(`PR #${pr.number} contains ${unsigned.length} unsigned commit(s) out of ${commits.length}.`)
    .addTable([
      [
        { data: 'SHA', header: true },
        { data: 'Author', header: true },
        { data: 'Reason', header: true },
      ],
      ...rows,
    ])
    .write();

  const lines = rows.map(([sha, author, reason]) => `  ${sha}  ${author}  (${reason})`);
  core.setFailed(
    [
      `${unsigned.length} unsigned commit(s) detected in PR #${pr.number}:`,
      ...lines,
      'All commits must be GPG/SSH/S-MIME signed and verifiable by GitHub.',
    ].join('\n'),
  );
};
