# AI based development workflow
I want to create an AI assisted development workflow/methodology that works with/through claude code and the terminal/
command line.

## Required Features

### Persistent "state" and "context" for the project
The AI agent should always be able to find exactly where we're at on any given implementation on any project. Context
and current state should always be recorded automatically.  This is primarily to avoid having to repeat work, and also
to keep context and state available for the AI agent when I need to clear context or start a new session.

### Required workflow
1. Agent should have a command (for example, "map") that allows me to map out the entire project, including all files,
functions, and classes. This should be done automatically by the agent, and should be updated constantly. It should
always keep a map of:
- all relevant/important files/folders/modules in the application
- all relevant/important functions and classes in the application
- the relationships between files, functions, and classes (e.g. which functions/classes are called by which files, etc.)
- the infrastructure of the application in all deployment environments (e.g. which services are used, how they are connected, etc.),
including dev/staging/production environments
- the current state of the project, including which features are implemented, which are in progress,
and which are planned for the future
- any relevant documentation, including design documents, architecture diagrams, etc.
2. Agent should have a command (for example, "recon"), that takes input from the user about what they want to implement,
and then automatically gathers all relevant context needed to implement that feature, including:
- which files, functions, and classes are relevant to the implementation of that feature
- any relevant documentation, design documents, architecture diagrams, etc.
- any relevant code snippets or examples from the codebase
- any relevant information about the infrastructure of the application that is relevant to the implementation of that feature
3. Agent should have a command (for example, "discuss") that forces a structured conversation about the implementation of a feature, including:
- discussing the requirements and specifications of the feature
- discussing the design and architecture of the feature
- discussing the implementation details of the feature, including which files, functions, and classes will be
involved in the implementation, and how they will interact with each other
- discussing any potential challenges or roadblocks that may arise during the implementation of the feature, and how to overcome them
- discussing any relevant documentation, design documents, architecture diagrams, etc. that are relevant to the implementation of the feature
- AI agent should be able to ask questions and provide suggestions during the discussion, and should be able to keep track of the conversation and the decisions made during the discussion
- AI agent should be able to record the discussion and the decisions made during the discussion, and should be able to refer back to it later when needed
- AI agent should be able to update the project map based on the decisions made during the discussion, and should be able to keep track of any changes made to the project map as a result of the discussion
- AI agent should always act as a facilitator during the discussion, and should always keep the conversation focused and productive,
while also ensuring that all relevant topics are covered and all relevant information is discussed
- AI agent should always act as a "devil's advocate" during the discussion, and should always challenge assumptions and encourage critical thinking,
while also being respectful and constructive in its feedback and suggestions
- AI agent should create a structured artifact from the discussion that can be used by the "spec" command to 
4. Agent should have a command (for example, "spec") that takes the artifact created by the "discuss" step to create
a structured PRD with machine checkable acceptance criteria
- the command should output a contract for the "plan" mode
5. Agent should have a "plan" command that decomposes an approved spec/PRD into an ordered, tracked implementation graph
used by the "build" command to implement the spec/PRD.
6. Agent should have a "build" command that can be run from inside claude code, or preferably from the terminal that:
- invokes a headless "ralph wiggum loop" instance of claude code uses structured json input/output to implement the
feature according to the implementation graph created by the "plan" command, while also referring back to the project map
and any relevant context as needed during the implementation process
- the "build" loop should run a TDD process, where it first creates tests for the feature to be implemented, and then implements the feature according to the implementation graph created by the "plan" command, while also referring back to the project map and any relevant context as needed during the implementation process
- the "build" command should be able to keep track of the implementation process, and should be able to provide updates
on the progress of the implementation, including which files, functions, and classes have been implemented, which are in progress, and which are planned for the future
- the "build" command should be able to automatically update the project map as the implementation process progresses, and should be able to keep track of any changes made to the project map as a result of the implementation process
- the "build" command should run autonomously (--dangerously-skip-permissions/etc), and impelemtn the ralph loop in a headless mode, where it can refer back to the project map and any relevant context as needed during the implementation process, without needing to ask for permission or input from the user, unless it encounters a roadblock or challenge that it cannot overcome on its own, in which case it should ask for input from the user on how to proceed, while also providing suggestions and potential solutions to the problem at hand
7. Agent should have an "improve" command that implements a similar process to the claude "improve" command after the build loop is complete, where it can refer back to the project map and any relevant context as needed during the improvement process, while also providing suggestions and potential improvements to the implementation that was just completed, and should be able to automatically update the project map as the improvement process progresses, and should be able to keep track of any changes made to the project map as a result of the improvement process
- the "improve" command should be able to be run from inside claude code, or autonomously as part of the build loop, where it can refer back to the project map and any relevant context as needed during the improvement process, without needing to ask for permission or input from the user, unless it encounters a roadblock or challenge that it cannot overcome on its own, in which case it should ask for input from the user on how to proceed, while also providing suggestions and potential solutions to the problem at hand
- the "improve" loop should NEVER change functionality, but should make improvements to the codebase that do not change functionality (e.g. refactoring, improving code quality, etc.) without needing to ask for permission or input from the user, while also providing suggestions and potential improvements to the implementation that was just completed, and should be able to automatically update the project map as the improvement process progresses, and should be able to keep track of any changes made to the project map as a result of the improvement process
- the "improve" loop should be able to be run multiple times, and should be able to keep track of the improvements made during each iteration of the loop, and should be able to refer back to previous iterations of the loop as needed during future iterations of the loop, while also providing suggestions and potential improvements to the implementation that was just completed, and should be able to automatically update the project map as the improvement process progresses, and should be able to keep track of any changes made to the project map as a result of the improvement process
9. Agent should have a "review" command that can be run after the "build" and "improve" loops are complete, where it can refer back to the project map and any relevant context as needed during the review process, while also providing suggestions and potential improvements to the implementation that was just completed, and should be able to automatically update the project map as the review process progresses, and should be able to keep track of any changes made to the project map as a result of the review process
- the "review" command should be able to be run from inside claude code, or autonomously as part of the build/improve loop, where it can refer back to the project map and any relevant context as needed during the review process, without needing to ask for permission or input from
the user, unless it encounters a roadblock or challenge that it cannot overcome on its own, in which case it should ask for input from the user on how to proceed, while also providing suggestions and potential solutions to the problem at hand
- the "review" process should involve a structured code review process, where the AI agent reviews the codebase for the implementation that was just completed, and provides feedback and suggestions for improvements to the codebase, while also keeping track of any changes made to the project map as a result of the review process, and should be able to refer back to previous iterations of the review process as needed during
future iterations of the review process, while also providing suggestions and potential improvements to the implementation that was just completed, and should be able to automatically update the project map as the review process progresses, and should be able to keep track of any changes made to the project map as a result of the review process
- the "review" process should also involve a structured testing process, where the AI agent reviews the tests for the implementation that was just completed, and provides feedback and suggestions for improvements to the tests, while also keeping track of any changes made to the project map as a result of the review process
- the "review" process should also involve a structured documentation review process, where the AI agent reviews the documentation for the implementation that was just completed, and provides feedback and suggestions for improvements to the documentation, while also keeping track of any changes made to the project map as a result of the review process
10. Agent should have a "secure" (or similar name) command that can be run after the "review" process is complete, where it runs a systematic security audit, including code, dependencies, secrets, and infrastructure, while also referring back to the project map and any relevant context as needed during the security audit process, while also providing suggestions and potential improvements to the security of the implementation that was just completed, and should be able to automatically update the project map as the security audit process progresses, and should be able to keep track of any changes made to the project map as a result of the security audit process
- the "secure" command should be able to be run from inside claude code, or autonomously as part of the review loop, where it can refer back to the project map and any relevant context as needed during the security audit process, without needing to ask for permission or input from the
user, unless it encounters a roadblock or challenge that it cannot overcome on its own, in which case it should ask for input from the user on how to proceed, while also providing suggestions and potential solutions to the problem at hand
- the "secure" process should involve a structured security audit process, where the AI agent reviews the codebase for the implementation that was just completed, and provides feedback and suggestions for improvements to thesecurity of the codebase, while also keeping track of any changes made to the project map as a
result of the security audit process, and should be able to refer back to previous iterations of the security audit process as needed during future iterations of the security audit process, while also providing suggestions and potential improvements to the security of the implementation that was just completed, and should be able to automatically update the project map as the security audit process progresses, and should be able to keep track of any changes made to the project map as a result of the security audit process
- the "secure" process should also involve a structured dependency review process, where the AI agent reviews the dependencies for the implementation that was just completed, and provides feedback and suggestions for improvements to thesecurity of the dependencies, while also keeping track of any changes made to the project map as a result
of the security audit process, and should be able to refer back to previous iterations of the security audit process as needed during future iterations of the security audit process, while also providing suggestions and potential improvements to the security of the dependencies for the implementation that was just completed, and should be able to automatically update the project map as the security audit process progresses, and should be able to keep track of any changes made to the project map as a result of the security audit process
- the "secure" process should also involve a structured secrets review process, where the AI agent reviews the secrets management for the implementation that was just completed, and provides feedback and suggestions for improvements to the security of the secrets management, while also keeping track of any changes made to the project map as
a result of the security audit process, and should be able to refer back to previous iterations of the security audit process as needed during future iterations of the security audit process, while also providing suggestions and potential improvements to the security of the secrets management for the implementation that was just completed, and should be able to automatically update the project map as the security audit process progresses, and should be able to keep track of any changes made to the project map as a result of the security audit process
- the "secure" process should also involve a structured infrastructure review process, where the AI agent
reviews the infrastructure for the implementation that was just completed, and provides feedback and suggestions for improvements to the security of the infrastructure, while also keeping track of any changes made to the project map as a result of the security audit process, and should be able to refer back to previous iterations of the security audit process as needed during future iterations of the security audit process, while also providing suggestions and potential improvements to the security of the infrastructure for the implementation that was just completed, and should be able to automatically update the project map as the security audit process progresses, and should be able to keep track of any changes made to the project map as a result of the security audit process
11. Agent should have a "release" command that can be run after the "secure" process is complete, where it runs a systematic deployment process, while also referring back to the project map
- release command should handle any versioning (according to semver), changelog generation, and deployment processes, while also providing suggestions and potential improvements to the release process, and should be able to automatically update the project map as the release process progresses, and should be able to keep track of any changes made to the project map as a result of the release process