/**
 * 🔧 BOWO Plugin Creator — Scaffold a new plugin
 *
 * Usage: npx tsx src/plugin-create.ts <plugin-name>
 */

import { PluginLoader } from "./plugins.js";

const name = process.argv[2];

if (!name) {
  console.log(`
  🔧 BOWO Plugin Creator

  Usage: npx tsx src/plugin-create.ts <plugin-name>

  Example:
    npx tsx src/plugin-create.ts data-analyst
    npx tsx src/plugin-create.ts ml-engineer
    npx tsx src/plugin-create.ts ui-designer

  This creates a plugin directory at:
    plugins/<name>/
      ├── manifest.json   (plugin metadata)
      └── agent.ts        (agent implementation)
  `);
  process.exit(0);
}

PluginLoader.scaffold(name, "plugins");
console.log(`\n🚀 Next steps:`);
console.log(`   1. Edit plugins/${name}/agent.ts`);
console.log(`   2. Customize plugins/${name}/manifest.json`);
console.log(`   3. Run: npx tsx src/cli.ts`);
