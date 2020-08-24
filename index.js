import {join} from "path";
import {writeFileSync} from "fs";
import {Extract} from "unzipper";
import {resolve} from 'path'
import {Readable} from 'stream'

const core = require("@actions/core");
const github = require("@actions/github");

async function main() {
    try {
        const token = core.getInput('authToken') || getRuntimeToken();
        const octokit = github.getOctokit(token);
        const repo = core.getInput('repository') || `${github.context.repo.owner}/${github.context.repo.repo}`

        const splitRepository = repo.split('/')
        if (splitRepository.length !== 2 || !splitRepository[0] || !splitRepository[1]) {
            throw new Error(`Invalid repository '${repo}'. Expected format {owner}/{repo}.`)
        }
        const repositoryOwner = splitRepository[0]
        const repositoryName = splitRepository[1]

        let runId = core.getInput("run-id");

        if (runId === '') {
            const workflowId = core.getInput('workflow-id')
            if (!workflowId) {
                throw new Error('Workflow ID must be provided if no Run ID is provided')
            }

            const workflow = await octokit.actions.listWorkflowRuns({
                owner: repositoryOwner,
                repo: repositoryName,
                workflow_id: workflowId,
                status: 'completed',
                per_page: 1,
                event: 'push',
                branch: core.getInput('branch') || 'master'
            });

            if (!workflow.data || !workflow.data.workflow_runs || !workflow.data.workflow_runs[0]) {
                throw new Error('No run found for given workflow')
            }
            runId = workflow.data.workflow_runs[0].id;
        }

        console.log(`Download artifact from run id ${runId}`);

        const artifacts = await octokit.actions.listWorkflowRunArtifacts({
            owner: repositoryOwner,
            repo: repositoryName,
            run_id: runId,
        });

        const source = core.getInput('artifact-name')

        let path = resolve(core.getInput("directory") || '.');
        for(let f in artifacts.data.artifacts) {
            if (!source || source === artifacts.data.artifacts[f].name) {
                const file = artifacts.data.artifacts[f];

                console.log(`Downloading ${file.name}`)

                const response = await octokit.actions.downloadArtifact({
                    owner: repositoryOwner,
                    repo: repositoryName,
                    artifact_id: file.id,
                    archive_format: "zip"
                });

                if (core.getInput("extract") === "true") {
                    await extract(path, response.data)
                } else {
                    writeFileSync(join(path, core.getInput('') || file.name + ".zip"), Buffer.from(response.data));
                }
            }
        }
    } catch (error) {
        console.log(error);
        core.setFailed(error.message);
    }
}

function getRuntimeToken() {
    const token = process.env['ACTIONS_RUNTIME_TOKEN']
    if (!token) {
        throw new Error('Unable to get ACTIONS_RUNTIME_TOKEN env variable')
    }
    return token
}

async function extract(path, data) {
    return new Promise((resolve, reject) => {
        const stream = Readable.from(Buffer.from(data));
        const dest = stream.pipe(Extract({path: path}));
        dest.on('finish', resolve)
    });
}

main();