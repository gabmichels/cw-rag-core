#!/usr/bin/env node

/**
 * Configuration Validation Script for Obsidian Ingestion Workflows
 *
 * This script validates the environment setup for n8n Obsidian workflows
 * and provides detailed feedback on configuration issues.
 *
 * Usage:
 *   node validate-config.js --tenant zenithfall
 *   node validate-config.js --template --env-file .env
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class WorkflowValidator {
  constructor(options = {}) {
    this.tenant = options.tenant;
    this.isTemplate = options.template;
    this.envFile = options.envFile;
    this.errors = [];
    this.warnings = [];
    this.config = {};
  }

  async validate() {
    console.log('🔍 Validating Obsidian Ingestion Workflow Configuration');
    console.log('=' .repeat(60));

    if (this.envFile) {
      this.loadEnvFile();
    }

    this.validateCore();
    this.validatePaths();
    this.validateCredentials();
    this.validateOptionalSettings();
    this.validateConnectivity();

    this.printResults();
    return this.errors.length === 0;
  }

  loadEnvFile() {
    try {
      if (fs.existsSync(this.envFile)) {
        const envContent = fs.readFileSync(this.envFile, 'utf8');
        const lines = envContent.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              process.env[key.trim()] = valueParts.join('=').trim();
            }
          }
        }
        console.log(`✅ Loaded environment from ${this.envFile}`);
      } else {
        this.warnings.push(`Environment file ${this.envFile} not found`);
      }
    } catch (error) {
      this.errors.push(`Failed to load environment file: ${error.message}`);
    }
  }

  validateCore() {
    console.log('\n📋 Core Configuration');

    // Required for all workflows
    const requiredVars = ['API_URL'];

    // Required for template workflow
    if (this.isTemplate) {
      requiredVars.push('OBSIDIAN_VAULT_PATH', 'TENANT_ID');
    }

    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (!value) {
        this.errors.push(`Missing required environment variable: ${varName}`);
      } else {
        this.config[varName] = value;
        console.log(`  ✅ ${varName}: ${value}`);
      }
    }

    // Zenithfall-specific validation
    if (this.tenant === 'zenithfall') {
      const zenithfallPath = 'C:\\Users\\gabmi\\OneDrive\\Documents\\Zenithfall';
      if (process.platform === 'win32') {
        this.config.OBSIDIAN_VAULT_PATH = zenithfallPath;
        console.log(`  ✅ OBSIDIAN_VAULT_PATH (zenithfall): ${zenithfallPath}`);
      } else {
        this.warnings.push('Zenithfall workflow designed for Windows platform');
      }
      this.config.TENANT_ID = 'zenithfall';
      console.log(`  ✅ TENANT_ID (zenithfall): zenithfall`);
    }
  }

  validatePaths() {
    console.log('\n📁 Path Validation');

    const vaultPath = this.config.OBSIDIAN_VAULT_PATH;
    if (vaultPath) {
      try {
        if (fs.existsSync(vaultPath)) {
          const stats = fs.statSync(vaultPath);
          if (stats.isDirectory()) {
            console.log(`  ✅ Vault directory exists: ${vaultPath}`);

            // Check for markdown files
            const markdownFiles = this.findMarkdownFiles(vaultPath);
            if (markdownFiles.length > 0) {
              console.log(`  ✅ Found ${markdownFiles.length} markdown files`);

              // Sample a few files for validation
              const sampleFiles = markdownFiles.slice(0, 3);
              for (const file of sampleFiles) {
                try {
                  const content = fs.readFileSync(file, 'utf8');
                  console.log(`    📄 ${path.basename(file)}: ${content.length} chars`);
                } catch (error) {
                  this.warnings.push(`Cannot read file ${file}: ${error.message}`);
                }
              }
            } else {
              this.warnings.push('No markdown files found in vault');
            }
          } else {
            this.errors.push(`Vault path is not a directory: ${vaultPath}`);
          }
        } else {
          this.errors.push(`Vault directory does not exist: ${vaultPath}`);
        }
      } catch (error) {
        this.errors.push(`Cannot access vault path: ${error.message}`);
      }
    }
  }

  findMarkdownFiles(dir) {
    const markdownFiles = [];
    const excludePaths = ['.obsidian', '.trash', 'templates', 'Archive'];

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory() && !excludePaths.includes(item)) {
          markdownFiles.push(...this.findMarkdownFiles(fullPath));
        } else if (stats.isFile() && (item.endsWith('.md') || item.endsWith('.markdown'))) {
          markdownFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors for now
    }

    return markdownFiles;
  }

  validateCredentials() {
    console.log('\n🔐 Credential Validation');

    if (this.tenant === 'zenithfall') {
      console.log('  ℹ️  Expected credential: zenithfallIngestToken');
      console.log('  ℹ️  Create in n8n: Credentials > New > API Key');
      console.log('  ℹ️  Name: zenithfallIngestToken, Key: token, Value: <your-token>');
    } else if (this.isTemplate) {
      const credentialName = process.env.CREDENTIAL_NAME || 'defaultIngestToken';
      console.log(`  ℹ️  Expected credential: ${credentialName}`);
      console.log('  ℹ️  Set CREDENTIAL_NAME environment variable to match your credential');
    }

    // Note: We can't validate actual credentials from this script
    this.warnings.push('Credential validation must be done in n8n interface');
  }

  validateOptionalSettings() {
    console.log('\n⚙️  Optional Settings');

    const optionalSettings = {
      'BATCH_SIZE': { default: 10, type: 'number', min: 1, max: 50 },
      'MAX_FILES_PER_RUN': { default: 100, type: 'number', min: 1 },
      'FILE_EXTENSIONS': { default: '.md,.markdown', type: 'string' },
      'EXCLUDE_PATHS': { default: '.obsidian,.trash,templates', type: 'string' },
      'INCREMENTAL_SYNC': { default: 'true', type: 'boolean' },
      'USE_IDEMPOTENCY': { default: 'true', type: 'boolean' },
      'ENABLE_TOMBSTONES': { default: 'true', type: 'boolean' },
      'DEFAULT_ACL': { default: 'public', type: 'string' },
      'SOURCE_NAME': { default: 'obsidian', type: 'string' },
      'DEFAULT_LANG': { default: 'en', type: 'string' }
    };

    for (const [key, spec] of Object.entries(optionalSettings)) {
      const value = process.env[key] || spec.default;
      let valid = true;

      if (spec.type === 'number') {
        const num = parseInt(value);
        if (isNaN(num)) {
          this.warnings.push(`${key} should be a number, got: ${value}`);
          valid = false;
        } else if (spec.min && num < spec.min) {
          this.warnings.push(`${key} should be >= ${spec.min}, got: ${num}`);
          valid = false;
        } else if (spec.max && num > spec.max) {
          this.warnings.push(`${key} should be <= ${spec.max}, got: ${num}`);
          valid = false;
        }
      } else if (spec.type === 'boolean') {
        if (!['true', 'false'].includes(value.toLowerCase())) {
          this.warnings.push(`${key} should be true/false, got: ${value}`);
          valid = false;
        }
      }

      if (valid) {
        console.log(`  ✅ ${key}: ${value}${process.env[key] ? '' : ' (default)'}`);
      }
    }
  }

  validateConnectivity() {
    console.log('\n🌐 Connectivity Validation');

    const apiUrl = this.config.API_URL;
    if (apiUrl) {
      try {
        // Simple URL validation
        new URL(apiUrl);
        console.log(`  ✅ API URL format valid: ${apiUrl}`);

        // Test connectivity (basic)
        console.log('  ℹ️  Testing API connectivity...');
        try {
          // Note: This is a basic test - actual testing requires proper auth
          const healthUrl = `${apiUrl}/healthz`;
          console.log(`  ℹ️  Health endpoint: ${healthUrl}`);
          console.log('  ⚠️  Manual verification required - test with actual credentials');
        } catch (error) {
          this.warnings.push(`Could not test API connectivity: ${error.message}`);
        }
      } catch (error) {
        this.errors.push(`Invalid API URL format: ${apiUrl}`);
      }
    }
  }

  printResults() {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Validation Results');
    console.log('=' .repeat(60));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('🎉 All validations passed! Configuration looks good.');
    } else {
      if (this.errors.length > 0) {
        console.log(`❌ ${this.errors.length} Error(s):`);
        for (const error of this.errors) {
          console.log(`   • ${error}`);
        }
      }

      if (this.warnings.length > 0) {
        console.log(`⚠️  ${this.warnings.length} Warning(s):`);
        for (const warning of this.warnings) {
          console.log(`   • ${warning}`);
        }
      }
    }

    console.log('\n📚 Next Steps:');
    if (this.errors.length > 0) {
      console.log('   1. Fix all errors listed above');
      console.log('   2. Re-run validation');
    } else {
      console.log('   1. Import workflow JSON into n8n');
      console.log('   2. Configure credentials in n8n interface');
      console.log('   3. Test with manual trigger');
      console.log('   4. Enable workflow for production');
    }

    console.log('\n🔗 Documentation:');
    console.log('   • Full setup guide: n8n/workflows/README.md');
    console.log('   • Workflow files: n8n/workflows/');
    console.log('   • Troubleshooting: See README.md "Common Issues" section');
  }
}

// CLI Interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tenant' && i + 1 < args.length) {
      options.tenant = args[++i];
    } else if (arg === '--template') {
      options.template = true;
    } else if (arg === '--env-file' && i + 1 < args.length) {
      options.envFile = args[++i];
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Obsidian Workflow Configuration Validator

Usage:
  node validate-config.js [options]

Options:
  --tenant <name>     Validate specific tenant (e.g., zenithfall)
  --template          Validate template workflow configuration
  --env-file <path>   Load environment variables from file
  --help              Show this help message

Examples:
  node validate-config.js --tenant zenithfall
  node validate-config.js --template --env-file .env
  node validate-config.js --template

Environment Variables:
  See README.md for complete list of supported environment variables.
`);
}

// Main execution
async function main() {
  const options = parseArgs();

  if (!options.tenant && !options.template) {
    console.log('❌ Please specify --tenant <name> or --template');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  const validator = new WorkflowValidator(options);
  const success = await validator.validate();

  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  });
}

module.exports = WorkflowValidator;