# Support

LibKa is open source, maintained by its publisher. Here is where to go and what to expect.

| You have | Go to |
|---|---|
| A question about using LibKa | Discussions, under Q&A |
| An idea, such as a new block | Discussions, under Ideas |
| A bug, including an accessibility defect in an output or in the Studio | An issue (the bug report form) |
| A security problem | Never in public: [SECURITY.md](SECURITY.md) |
| A conduct problem | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |

## What to expect

- **Issues and Discussions are triaged once a week,** on a best-effort basis. A first answer can take a week or more; it is not a sign the report was ignored.
- **Security reports** are acknowledged within five working days ([SECURITY.md](SECURITY.md)).
- **No private support:** please ask in public, so the answer helps the next person. There is no support by e-mail or chat.
- **Help yourself first:** the [documentation](docs/README.md), the [block catalog](docs/blocks.md), the [problem codes](docs/problem-codes.md) (every message `libka lint` prints, with its fixes) and [when a check fails](docs/admin/when-a-check-fails.md).

## A good question or report

- The smallest document that shows the problem, and what you expected instead.
- The output of `npx -y @libka/cli lint <file.md>` (`node packages/cli/src/libka.ts lint` in a clone of this repository) or of the build, as text.
- Your operating system, Node.js version and browser.
