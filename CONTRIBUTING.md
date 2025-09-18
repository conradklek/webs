# Contributing to Webs

We welcome any type of contribution, not just code. You can help with:

- **Reporting a bug**
- **Discussing the current state of the code**
- **Submitting a fix**
- **Proposing new features**
- **Becoming a maintainer**

## How to Report a Bug 🐛

If you find a bug, please create an issue in our GitHub repository. A great bug report includes:

1.  A quick summary of the problem.
2.  Steps to reproduce the bug.
3.  What you expected to happen.
4.  What actually happened.
5.  The version of Webs and Bun you are using.

## How to Suggest a Feature 💡

If you have an idea for a new feature, please create an issue. Describe the feature, why it's needed, and provide a clear use case. This allows for a healthy discussion before any code is written.

## Your First Code Contribution

Ready to contribute code? Here’s how to set up your environment and submit a pull request.

### Development Setup

1.  Fork the `webs` repository on GitHub.
2.  Clone your forked repository: `git clone https://github.com/YOUR_USERNAME/webs.git`
3.  Navigate to the project directory: `cd webs`
4.  Install the dependencies: `bun install`

### Running Tests

To ensure everything is working correctly, run the full test suite:

```bash
bun run check:tests
```

Before submitting your changes, please also run the type checker:

```bash
bun run check:types
```

### Submitting a Pull Request

1.  Create a new branch for your feature or bug fix: `git checkout -b feature/your-awesome-feature`.
2.  Make your changes.
3.  Add tests for your changes.
4.  Ensure all tests and type checks pass.
5.  Push your branch to your fork and submit a pull request to the `main` branch of the official Webs repository.
