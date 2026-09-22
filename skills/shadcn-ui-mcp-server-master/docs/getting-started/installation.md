# Installation

This guide covers how to install and run the shadcn/ui MCP Server.

## 🚀 Quick Installation

### Using npx (Recommended)

The fastest way to get started - no installation required!

```bash
# Basic usage (rate limited to 60 requests/hour)
npx @jpisnice/shadcn-ui-mcp-server

# With GitHub token for better rate limits (5000 requests/hour)
npx @jpisnice/shadcn-ui-mcp-server --github-api-key ghp_your_token_here

# Short form
npx @jpisnice/shadcn-ui-mcp-server -g ghp_your_token_here
```

### Global Installation (Optional)

If you plan to use the server frequently, you can install it globally:

```bash
# Install globally
npm install -g @jpisnice/shadcn-ui-mcp-server

# Run from anywhere
shadcn-ui-mcp-server --github-api-key ghp_your_token_here
```

## 🔧 Command Line Options

```bash
shadcn-ui-mcp-server [options]

Options:
  --github-api-key, -g <token>    GitHub Personal Access Token
  --framework, -f <framework>     Framework to use: 'react', 'svelte', 'vue', or 'react-native' (default: react)
  --help, -h                      Show help message
  --version, -v                   Show version information

Environment Variables:
  GITHUB_PERSONAL_ACCESS_TOKEN    Alternative way to provide GitHub token
  FRAMEWORK                       Framework to use: 'react', 'svelte', 'vue', or 'react-native' (default: react)

Examples:
  npx @jpisnice/shadcn-ui-mcp-server --help
  npx @jpisnice/shadcn-ui-mcp-server --version
  npx @jpisnice/shadcn-ui-mcp-server -g ghp_1234567890abcdef
  GITHUB_PERSONAL_ACCESS_TOKEN=ghp_token npx @jpisnice/shadcn-ui-mcp-server
  npx @jpisnice/shadcn-ui-mcp-server --framework svelte
  npx @jpisnice/shadcn-ui-mcp-server -f react
  export FRAMEWORK=svelte && npx @jpisnice/shadcn-ui-mcp-server
```

## 🎯 Framework Selection

The server supports four frameworks. See [Framework Selection](framework-selection.md) for details:

```bash
# React (default)
npx @jpisnice/shadcn-ui-mcp-server

# Svelte
npx @jpisnice/shadcn-ui-mcp-server --framework svelte

# Vue
npx @jpisnice/shadcn-ui-mcp-server --framework vue

# React Native
npx @jpisnice/shadcn-ui-mcp-server --framework react-native
```

## 🔑 GitHub Token Setup

For optimal performance, set up a GitHub Personal Access Token:

1. **Get your token**: [GitHub Token Setup](github-token.md)
2. **Use it**: 
   ```bash
   # Method 1: Command line
   npx @jpisnice/shadcn-ui-mcp-server --github-api-key ghp_your_token_here
   
   # Method 2: Environment variable
   export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here
   npx @jpisnice/shadcn-ui-mcp-server
   ```

## ✅ Verification

Test that the server is working:

```bash
# Check version
npx @jpisnice/shadcn-ui-mcp-server --version

# Check help
npx @jpisnice/shadcn-ui-mcp-server --help

# Run server (should start without errors)
npx @jpisnice/shadcn-ui-mcp-server
```

## 🔗 Next Steps

- [GitHub Token Setup](github-token.md) - Set up optimal performance
- [Framework Selection](framework-selection.md) - Choose your framework
- [First Steps](first-steps.md) - Make your first component request
- [Integration](../integration/) - Connect to your editor or tool 
