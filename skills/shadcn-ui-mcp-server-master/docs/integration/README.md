# Integration

Connect the shadcn/ui MCP Server to your favorite editor or AI tool.

## 🔌 Available Integrations

| Tool | Status | Guide |
|------|--------|-------|
| **VS Code** | ✅ Supported | [VS Code Integration](vscode.md) |
| **Cursor** | ✅ Supported | [Cursor Integration](cursor.md) |
| **Claude Desktop** | ✅ Supported | [Claude Desktop Integration](claude-desktop.md) |
| **Continue.dev** | ✅ Supported | [Continue.dev Integration](continue.md) |
| **Claude Code** | ✅ Supported | [Claude Code Integration](claude-code.md) |

## 🚀 Quick Integration

### VS Code (Most Popular)

1. **Install Continue Extension**
2. **Add MCP Server configuration**
3. **Start asking questions**

See [VS Code Integration](vscode.md) for detailed steps.

### Claude Desktop

1. **Edit configuration file**
2. **Add MCP Server**
3. **Restart Claude Desktop**

See [Claude Desktop Integration](claude-desktop.md) for details.

## 🎯 What You Can Do After Integration

- **Ask for component source code** directly in your editor
- **Get component demos** and usage examples
- **Retrieve complete blocks** (dashboards, forms, etc.)
- **Explore repository structure** without leaving your tool
- **Compare framework implementations** (React, Svelte, Vue, React Native)

## 🔧 Common Configuration

Most integrations use this basic configuration:

```json
{
  "command": "npx",
  "args": [
    "@jpisnice/shadcn-ui-mcp-server",
    "--github-api-key",
    "ghp_your_token_here"
  ]
}
```

For different frameworks:

```json
{
  "command": "npx",
  "args": [
    "@jpisnice/shadcn-ui-mcp-server",
    "--framework",
    "svelte",
    "--github-api-key",
    "ghp_your_token_here"
  ]
}
```

```json
{
  "command": "npx",
  "args": [
    "@jpisnice/shadcn-ui-mcp-server",
    "--framework",
    "react-native",
    "--github-api-key",
    "ghp_your_token_here"
  ]
}
```

## 🐛 Troubleshooting

### Integration Not Working

1. **Verify server runs standalone**:
   ```bash
   npx @jpisnice/shadcn-ui-mcp-server --help
   ```

2. **Check configuration syntax** - JSON must be valid

3. **Restart your tool** after configuration changes

4. **Check logs** for error messages

### Common Issues

- **Command not found**: Ensure `npx` is available
- **Rate limit errors**: Add GitHub token
- **Framework issues**: Verify framework parameter
- **Permission errors**: Check file permissions

## 🔗 Next Steps

- [Getting Started](../getting-started/) - Installation and setup
- [Usage Examples](../usage/) - How to use after integration
- [Troubleshooting](../troubleshooting/) - Common issues and solutions
- [API Reference](../api/) - Complete tool reference 
