import * as path from "path";
import { promises as fs } from "fs";
import { resolveIcon } from "../src/icon-resolver";
import { findCollection } from "../src/collections";

interface Spec {
  usageName: string;
  mustResolve?: Record<string, string>;
  mustNotResolve?: Record<string, string[]>;
  expectedPreserved?: boolean;
}

interface Failure {
  spec: string;
  case: string;
  expected: string;
  actual: string;
}

async function main() {
  const specPath = path.join(__dirname, "..", "tests", "usage-regression.spec.json");
  const specs = JSON.parse(await fs.readFile(specPath, "utf-8")) as Spec[];

  const failures: Failure[] = [];
  let passed = 0;
  let assertions = 0;

  for (const spec of specs) {
    // mustResolve：每个 (collection, expected) 必须命中
    for (const [collection, expected] of Object.entries(spec.mustResolve ?? {})) {
      assertions++;
      const r = resolveIcon(spec.usageName, { collection });
      if (!r) {
        failures.push({
          spec: spec.usageName,
          case: `mustResolve.${collection}`,
          expected,
          actual: "undefined",
        });
      } else if (r.iconName !== expected) {
        failures.push({
          spec: spec.usageName,
          case: `mustResolve.${collection}`,
          expected,
          actual: r.iconName,
        });
      } else if (r.collection !== collection) {
        failures.push({
          spec: spec.usageName,
          case: `mustResolve.${collection}`,
          expected: `${collection}:${expected}`,
          actual: `${r.collection}:${r.iconName} (fallback)`,
        });
      } else {
        passed++;
      }
    }

    // mustNotResolve：不应解析到这些名字
    for (const [collection, blockedNames] of Object.entries(spec.mustNotResolve ?? {})) {
      for (const blocked of blockedNames) {
        assertions++;
        const r = resolveIcon(spec.usageName, { collection });
        if (r && r.iconName === blocked) {
          failures.push({
            spec: spec.usageName,
            case: `mustNotResolve.${collection}`,
            expected: `not ${blocked}`,
            actual: r.iconName,
          });
        } else {
          passed++;
        }
      }
    }

    // expectedPreserved：collection.defaultPreserve === true
    if (spec.expectedPreserved !== undefined) {
      assertions++;
      const r = resolveIcon(spec.usageName, {
        collection: Object.keys(spec.mustResolve ?? {})[0] ?? "snowui",
      });
      const col = r ? findCollection(r.collection) : undefined;
      const actualPreserve = col?.defaultPreserve === true;
      if (actualPreserve !== spec.expectedPreserved) {
        failures.push({
          spec: spec.usageName,
          case: "expectedPreserved",
          expected: String(spec.expectedPreserved),
          actual: String(actualPreserve),
        });
      } else {
        passed++;
      }
    }
  }

  console.log(`\n[regression] ${passed}/${assertions} passed across ${specs.length} usageNames`);
  if (failures.length > 0) {
    console.log(`\n❌ ${failures.length} failure(s):`);
    for (const f of failures) {
      console.log(`  - ${f.spec} · ${f.case}: expected=${f.expected} actual=${f.actual}`);
    }
    process.exit(1);
  } else {
    console.log("✅ all regression checks pass");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
