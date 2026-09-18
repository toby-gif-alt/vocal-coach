import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

function namedExports(source) {
  const exports = new Set(
    [...source.matchAll(/\bexport\s+(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)]
      .map((match) => match[1]),
  );
  for (const list of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const item of list[1].split(",")) {
      const [, exportedName] = item.trim().match(/^\S+(?:\s+as\s+(\S+))?$/) || [];
      const name = exportedName || item.trim().split(/\s+/)[0];
      if (name) exports.add(name);
    }
  }
  return exports;
}

test("every named app.js import is exported by its target module", async () => {
  const appUrl = new URL("../app.js", import.meta.url);
  const appSource = await readFile(appUrl, "utf8");
  const imports = [...appSource.matchAll(/\bimport\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g)];
  assert.ok(imports.length > 0, "expected app.js to contain named imports");

  const missing = [];
  for (const [, importedList, specifier] of imports) {
    const moduleUrl = new URL(specifier.replace(/[?#].*$/, ""), appUrl);
    const moduleSource = await readFile(moduleUrl, "utf8");
    const available = namedExports(moduleSource);
    for (const item of importedList.split(",")) {
      const importedName = item.trim().split(/\s+as\s+/)[0];
      if (importedName && !available.has(importedName)) missing.push(`${specifier}: ${importedName}`);
    }
  }

  assert.deepEqual(missing, [], `app.js imports missing exports:\n${missing.join("\n")}`);
});
