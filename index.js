import {join} from "path";
import {appendFileSync} from "fs";
import {Extract} from "unzipper";
import {resolve} from 'path'

const core = require("@actions/core");
const github = require("@actions/github");
const { Octokit } = require("@octokit/rest");

main().finally();

async function main() {
    try {
        const token = core.getInput('authToken')
        const octokit = new Octokit({
            auth: token
        });
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

                const response = await octokit.actions.downloadArchive({
                    owner: repositoryOwner,
                    repo: repositoryName,
                    artifact_id: file.id,
                    archive_format: "zip"
                });

                if (core.getInput("extract") === "true") {
                    response.data.pipe(Extract({path: path}));
                } else {
                    appendFileSync(join(path, core.getInput('') || files[f].name + ".zip"), response.data);
                }
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}