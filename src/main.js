const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');
const github = require('@actions/github');

const { checkPermission } = require('actions-util/lib/check');
const { dealStringToArr } = require('actions-util/lib/deal');
const { THANKS } = require('actions-util/lib/thanks');

// **********************************************************
const token = core.getInput('token');
const octokit = new Octokit({ auth: `token ${token}` });
const context = github.context;

const FIXED = '<!-- Created by actions-cool/pr-welcome. Do not remove. -->';
const ALLEMOJI = ['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'];

// **********************************************************
async function run() {
  try {
    const { owner, repo } = context.repo;
    if (context.eventName === 'pull_request_target' || context.eventName === 'pull_request') {
      const title = context.payload.pull_request.title;
      const body = context.payload.pull_request.body;
      const number = context.payload.pull_request.number;
      const creator = context.payload.pull_request.user.login;

      const needCreatorAuthority = core.getInput('need-creator-authority');
      const refuseIssueLabel = core.getInput('refuse-issue-label');

      const comment = core.getInput('comment');
      const emoji = core.getInput('emoji');
      const PRemoji = core.getInput('pr-emoji');
      const close = core.getInput('close');
      const reviewersString = core.getInput('reviewers');
      const reviewCreator = core.getInput('review-creator') || 'true';

      let result = true;

      // ********************************************************
      async function getIssues(page = 1) {
        let { data: issues } = await octokit.issues.listForRepo({
          owner,
          repo,
          state: 'open',
          labels: refuseIssueLabel,
          per_page: 100,
          page,
        });
        if (issues.length >= 100) {
          issues = issues.concat(await getIssues(page + 1));
        }
        return issues;
      }

      async function checkAuthority() {
        let out;
        const res = await octokit.repos.getCollaboratorPermissionLevel({
          owner,
          repo,
          username: creator,
        });
        const { permission } = res.data;
        out = checkPermission(needCreatorAuthority, permission);
        core.info(`The user ${creator} check ${out}`);
        return out;
      }

      // ********************************************************
      if (refuseIssueLabel) {
        const issues = await getIssues();
        const issuesNumber = issues.map(({ number }) => number);
        for await (let issueNo of issuesNumber) {
          core.info(`Check issue ${issueNo}`);
          if (
            result &&
            ((title && title.includes(issueNo)) ||
              (body && body.includes(`#${issueNo}`)) ||
              (body && body.includes(`issues/${issueNo}`)))
          ) {
            if (needCreatorAuthority) {
              result = await checkAuthority();
            } else {
              result = false;
            }
          } else {
            core.info(`The pr do not mention issue ${issueNo}`);
          }
        }
      } else if (needCreatorAuthority) {
        result = await checkAuthority();
      }

      if (result && !refuseIssueLabel && !needCreatorAuthority) {
        result = false;
      }

      core.info(`The result is ${result}.`);

      if (!result) {
        if (comment) {
          let ifHasComment = false;
          const commentData = await octokit.issues.listComments({
            owner,
            repo,
            issue_number: number,
          });

          const commentsArr = commentData.data;
          for (let i = 0; i < commentsArr.length; i++) {
            if (commentsArr[i].body && commentsArr[i].body.includes(FIXED)) {
              ifHasComment = true;
              break;
            }
          }

          if (!ifHasComment) {
            const { data } = await octokit.issues.createComment({
              owner,
              repo,
              issue_number: number,
              body: `${comment}\n\n${FIXED}`,
            });
            core.info(`Actions: [create-comment][${number}] success!`);
            if (emoji) {
              for await (let content of dealStringToArr(emoji)) {
                if (ALLEMOJI.includes(content)) {
                  await octokit.reactions.createForIssueComment({
                    owner,
                    repo,
                    comment_id: data.id,
                    content,
                  });
                  core.info(`Actions: [add-emoji][${content}] success!`);
                }
              }
            }
          } else {
            core.info(`Already commented!`);
          }
        }

        if (reviewersString) {
          let reviewers = dealStringToArr(reviewersString);
          if (reviewCreator === 'false') {
            reviewers = reviewers.filter(o => o !== creator);
          }
          await octokit.pulls.requestReviewers({
            owner,
            repo,
            pull_number: number,
            reviewers,
          });
          core.info(`Actions: [add-reviewers][${reviewersString}] success!`);
        }

        if (PRemoji) {
          for await (let content of dealStringToArr(PRemoji)) {
            if (ALLEMOJI.includes(content)) {
              await octokit.reactions.createForIssue({
                owner,
                repo,
                issue_number: number,
                content,
              });
              core.info(`Actions: [add-PRemoji][${content}] success!`);
            }
          }
        }

        if (close == 'true') {
          await octokit.issues.update({
            owner,
            repo,
            issue_number: number,
            state: 'closed',
          });
          core.info(`Actions: [close-pr][${number}] success!`);
        }

        if (refuseIssueLabel || needCreatorAuthority) {
          core.setFailed(`[${creator}] refuse!`);
        } else {
          core.info(`[${creator}] welcome!`);
        }
      }

      core.info(THANKS);
    } else {
      core.setFailed(`This Action only support "pull_request" or "pull_request_target"!`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
