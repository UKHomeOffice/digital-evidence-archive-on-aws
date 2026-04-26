# Developer Guidelines

This document outlines the standard development practices and conventions for the Digital Evidence Archive (DEA) project. Following these guidelines ensures consistency, quality, and smooth collaboration across the team.

## Branching Strategy

### Main Branch
- Currently, our primary development branch is **`HOMS-MAIN`**.
- All feature branches should be branched from and merged back into `HOMS-MAIN`.
- *Note: This may change when moving into Beta, at which point we might fork from the original repo.*

### Branch Naming Convention
We use a structured naming convention for branches to link them to Jira tickets and provide context:
- **Format:** `feature/HOMS-<JiraID>/<short_description>`
- **Example:** `feature/HOMS-12/add_audit_logs`

## Commit Messages

Commit messages should be descriptive and follow a specific structure to ensure a clear history and easy traceability to Jira.

### Format
```text
<type>: HOMS-<JiraID> - <short summary>

<detailed description of changes>
- List of specific changes
- Technical decisions made
- Fixes or adjustments

https://jira.bics-collaboration.homeoffice.gov.uk/browse/HOMS-<JiraID>
```

### Example
```text
feature: HOMS-102 - upgrade node

Upgrade node to LTS version 24.15.0
Upgrade Typescript to ^5.4.5
Upgrade AWS SDK to ~3.1031.0
Upgrade AWS CDK to 2.1118.2
Upgrade ESLint to ^8.57.0
Upgrade Typescript eslint parser to ^7.18.0
Upgrade dynamodb onetable to 2.7.7
Upgrade Rush to 5.175.0
Upgrade PNPM to 10.33.0
Upgrade lambda runtimes to NODEJS_22_X
Copied pnpm-lock.yaml to dea-backend - necessary because of npm version update
Fix Jest tests - adding the --experimental-vm-modules to setEnv.sh and setDummyEnv.sh
Fix DEA-APP tests related to session TTL following upgrades.
Migrate the lockfile so that it is compatible with the newer version of pnpm
Update the github actions config to use Node 24
Temp change to github workflow config stage and domain_prefix for testing this - in case lambdas incompatible.

https://jira.bics-collaboration.homeoffice.gov.uk/browse/HOMS-102
```

## Development Workflow

1.  **Sync:** Ensure your local `HOMS-MAIN` is up to date.
    ```bash
    git checkout HOMS-MAIN
    git pull origin HOMS-MAIN
    ```
2.  **Branch:** Create a new branch following the naming convention. Move the Jira ticket to **IN PROGRESS**.
    ```bash
    git checkout -b feature/HOMS-XXX/my-feature
    ```
3.  **Implement & Test:** Write code and include tests. Use `rush` for repository management.
    - Run `rush build` to ensure everything compiles.
    - Run `rush unit:only` or `rush integration:only` as needed.
4.  **Commit:** Follow the commit message guidelines.
5.  **Rebase:** Before pushing, rebase with the latest `HOMS-MAIN`.
    ```bash
    git pull origin HOMS-MAIN --rebase
    ```
6.  **Pull Request:** Submit a PR on GitHub. Assign a reviewer and ensure all CI checks pass. Move the Jira ticket to **IN REVIEW**.
7.  **Peer Review:** All code must be reviewed and approved by at least one other developer. Once approved, move the Jira ticket to **DEV DONE**.
8.  **Deploy to Test:** Once peer-reviewed, the code is deployed to the designated test environment. Move the Jira ticket to **QA / IN TEST**.
9.  **QA Testing:** Notify the QA team with details of the changes and the deployment location for verification.
10. **Merge:** Once QA has verified the changes and all CI checks pass, merge the PR into `HOMS-MAIN`.
11. **Deploy to Pre-Production:** Merged code is deployed to the pre-production environment.
12. **Automated & Manual Testing:** An automated test suite runs in pre-production, and QA performs additional manual testing as needed.
13. **Done:** Once final verification is complete, the Jira ticket is moved to **DONE**.

## Jira Ticket Management

We use Jira to track our work. It is essential to keep the status of your tickets up to date to provide visibility to the rest of the team.

### Standard Definitions & Statuses

- **TODO:** Work that has been prioritized but not yet started.
- **IN PROGRESS:** The developer is actively working on the task.
- **IN REVIEW:** The code has been submitted as a Pull Request and is awaiting peer review.
- **DEV DONE:** The code has been peer-reviewed, approved, and all CI checks are green. It is ready for deployment to the test environment.
- **QA / IN TEST:** The code has been deployed to the test environment and is being verified by QA.
- **DONE:** The work is merged into `HOMS-MAIN`, verified in pre-production, and considered complete.

### When to Update

- **Start of work:** Move ticket to **IN PROGRESS**.
- **PR Submission:** Move ticket to **IN REVIEW**.
- **Peer Review Approval:** Move ticket to **DEV DONE**.
- **Deployment to Test:** Move ticket to **QA / IN TEST**.
- **Post-Merge Verification:** Move ticket to **DONE** after final verification in pre-production.

## Peer Reviews

All code changes must undergo a peer review process on GitHub before being merged into the `HOMS-MAIN` branch.

- **Requirement:** At least one approval from a team member is required for every Pull Request.
- **Process:**
  - Assign reviewers when creating the PR.
  - Address all comments and feedback provided during the review.
  - Ensure the branch is up-to-date with `HOMS-MAIN` (rebase if necessary) before the final merge.
  - Code should not proceed to QA until it has been approved and all CI checks are green.

## QA Testing

Following successful peer review, the code undergoes QA verification.

- **Deployment:** Approved code is deployed to a test environment.
- **Notification:** The QA team must be notified with:
  - Details of the changes made.
  - The specific environment/URL where the code is deployed.
- **Verification:** QA confirms the functionality and ensures no regressions were introduced.
- **Approval:** QA approval is required before the final merge into `HOMS-MAIN`.

## Pre-Production & Final Verification

After merging into `HOMS-MAIN`, the code is promoted to the pre-production environment for final validation.

- **Deployment:** The `HOMS-MAIN` branch is deployed to the pre-production environment.
- **Automated Testing:** A comprehensive automated test suite is configured to run automatically upon deployment to pre-production.
- **Manual QA:** QA performs any manual testing they deem appropriate in the pre-production environment to ensure production readiness.

## Coding Standards & Best Practices

- **Language:** We use TypeScript for both application code and CDK infrastructure.
- **Consistency:** Follow the existing code style. Use ESLint and Prettier (integrated via Rush/PNPM).
- **Tooling:** 
  - Use **Rush** for monorepo management.
  - Use **PNPM** for package management.
- **Testing Requirements:**
  - **Unit Tests:** Required for all new logic (`.unit.test.ts`).
  - **Integration Tests:** Required for component interactions (`.integration.test.ts`).
  - **E2E Tests:** Required for critical paths and API endpoints (`.e2e.test.ts`).
  - Aim for high code coverage (see README for current targets).
- **Security:** 
  - Never commit credentials or secrets.
  - Use AWS IAM roles and least privilege principles.
  - Scan for vulnerabilities using the provided scripts (e.g., `codescan-prebuild-custom.sh`).

## Documentation
- Keep READMEs and JSDoc/KDoc comments up to date.
- Document any significant architectural decisions in the `docs/` folder.
