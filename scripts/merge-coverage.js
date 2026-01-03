#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COVERAGE_DIR = path.join(process.cwd(), 'coverage');
const UNIT_COVERAGE = path.join(COVERAGE_DIR, 'unit', 'coverage-final.json');
const E2E_COVERAGE = path.join(COVERAGE_DIR, 'e2e', 'coverage-final.json');
const MERGED_DIR = path.join(COVERAGE_DIR, 'merged');
const FINAL_LCOV = path.join(COVERAGE_DIR, 'lcov.info');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function mergeCoverage() {
  console.log('📊 Merging coverage reports...\n');

  ensureDir(MERGED_DIR);

  const coverageFiles = [];

  if (fs.existsSync(UNIT_COVERAGE)) {
    coverageFiles.push(UNIT_COVERAGE);
    console.log('✅ Found unit test coverage');
  } else {
    console.log('⚠️  Unit test coverage not found');
  }

  if (fs.existsSync(E2E_COVERAGE)) {
    coverageFiles.push(E2E_COVERAGE);
    console.log('✅ Found E2E test coverage');
  } else {
    console.log('⚠️  E2E test coverage not found');
  }

  if (coverageFiles.length === 0) {
    console.error('❌ No coverage files found');
    process.exit(1);
  }

  if (coverageFiles.length === 1) {
    console.log('\n📋 Only one coverage source, copying...');
    fs.copyFileSync(
      coverageFiles[0],
      path.join(MERGED_DIR, 'coverage-final.json'),
    );
  } else {
    console.log('\n📋 Merging coverage files...');

    const merged = {};

    for (const file of coverageFiles) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

      for (const [filePath, fileCoverage] of Object.entries(data)) {
        if (!merged[filePath]) {
          merged[filePath] = fileCoverage;
        } else {
          merged[filePath] = mergeSingleFile(merged[filePath], fileCoverage);
        }
      }
    }

    fs.writeFileSync(
      path.join(MERGED_DIR, 'coverage-final.json'),
      JSON.stringify(merged, null, 2),
    );
  }

  console.log('\n📋 Generating LCOV report...');

  try {
    execSync(
      `npx nyc report --temp-dir ${MERGED_DIR} --reporter=lcov --report-dir ${COVERAGE_DIR}`,
      { stdio: 'inherit' },
    );
  } catch {
    console.log('Trying alternative report generation...');
    execSync(
      `npx nyc report --temp-dir ${MERGED_DIR} --reporter=lcovonly --report-dir ${COVERAGE_DIR}`,
      { stdio: 'inherit' },
    );
  }

  if (fs.existsSync(FINAL_LCOV)) {
    const stats = fs.statSync(FINAL_LCOV);
    console.log(`\n✅ Coverage merged successfully!`);
    console.log(`   Output: ${FINAL_LCOV} (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    console.log('\n⚠️  LCOV file not generated, trying text-summary...');
    execSync(
      `npx nyc report --temp-dir ${MERGED_DIR} --reporter=text-summary`,
      { stdio: 'inherit' },
    );
  }
}

function mergeSingleFile(existing, incoming) {
  const result = { ...existing };

  if (incoming.s) {
    for (const [key, value] of Object.entries(incoming.s)) {
      result.s[key] = (result.s[key] || 0) + value;
    }
  }

  if (incoming.f) {
    for (const [key, value] of Object.entries(incoming.f)) {
      result.f[key] = (result.f[key] || 0) + value;
    }
  }

  if (incoming.b) {
    for (const [key, value] of Object.entries(incoming.b)) {
      if (!result.b[key]) {
        result.b[key] = value;
      } else {
        result.b[key] = result.b[key].map((v, i) => v + (value[i] || 0));
      }
    }
  }

  return result;
}

mergeCoverage();
