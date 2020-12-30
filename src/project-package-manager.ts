import path from 'path';
import os from 'os';
import fs from 'fs';
import semver from 'semver';
import stripAnsi from 'strip-ansi';
import execa from 'execa';
import minimist from 'minimist';
import ini from 'ini';
import chalk from 'chalk';

import {
    hasProjectYarn,
    hasProjectPnpm,
    hasProjectNpm,
    hasYarn,
    hasPnpm3OrLater,
    warn,
    error,
    log,
    request,
} from './util';

function extractPackageScope(packageName) {
    const scopedNameRegExp = /^(@[^\/]+)\/.*$/;
    const result = packageName.match(scopedNameRegExp);

    if (!result) {
        return undefined;
    }

    return result[1];
}

const SUPPORTED_PACKAGE_MANAGERS = ['yarn', 'pnpm', 'npm'];

export default class PackageManager {
    context: string;
    _registries: string;
    bin: string;
    needsNpmInstallFix: boolean;
    needsPeerDepsFix: boolean;

    constructor(context?: string, forcePackageManager?: string) {
        this.context = context || process.cwd();

        this._registries = '';
        this.bin = '';
        this.needsNpmInstallFix = false;
        this.needsPeerDepsFix = false;

        if (forcePackageManager) {
            this.bin = forcePackageManager;
        }
        else if (context) {
            if (hasProjectYarn(context)) {
                this.bin = 'yarn';
            }
            else if (hasProjectPnpm(context)) {
                this.bin = 'pnpm';
            }
            else if (hasProjectNpm(context)) {
                this.bin = 'npm';
            }
        }

        if (!this.bin) {
            this.bin = hasYarn() ? 'yarn' : hasPnpm3OrLater() ? 'pnpm' : 'npm';
        }

        if (this.bin === 'npm') {
            // npm doesn't support package aliases until v6.9
            const MIN_SUPPORTED_NPM_VERSION = '6.9.0';
            const npmVersion = stripAnsi(
                execa.sync('npm', ['--version']).stdout
            );

            if (semver.lt(npmVersion, MIN_SUPPORTED_NPM_VERSION)) {
                warn(
                    'You are using an outdated version of NPM.\n'
                        + 'there may be unexpected errors during installation.\n'
                        + 'Please upgrade your NPM version.'
                );

                this.needsNpmInstallFix = true;
            }

            if (semver.gte(npmVersion, '7.0.0')) {
                this.needsPeerDepsFix = true;
            }
        }

        if (!SUPPORTED_PACKAGE_MANAGERS.includes(this.bin)) {
            log();
            warn(
                `The package manager ${chalk.red(this.bin)} is ${chalk.red(
                    'not officially supported'
                )}.\n`
                    + `It will be treated like ${chalk.cyan(
                        'npm'
                    )}, but compatibility issues may occur.\n`
                    + `See if you can use ${chalk.cyan('--registry')} instead.`
            );
        }
    }

    async getRegistry(scope?: string): Promise<string> {
        if (this._registries) {
            return this._registries;
        }

        const args = minimist(process.argv, {
            alias: {
                r: 'registry',
            },
        });

        let registry;
        if (args.registry) {
            registry = args.registry;
        }
        else {
            try {
                if (scope) {
                    registry = (
                        await execa(this.bin, [
                            'config',
                            'get',
                            scope + ':registry',
                        ])
                    ).stdout;
                }
                if (!registry || registry === 'undefined') {
                    registry = (
                        await execa(this.bin, ['config', 'get', 'registry'])
                    ).stdout;
                }
            }
            catch (e) {
                // Yarn 2 uses `npmRegistryServer` instead of `registry`
                registry = (
                    await execa(this.bin, [
                        'config',
                        'get',
                        'npmRegistryServer',
                    ])
                ).stdout;
            }
        }

        return (this._registries = stripAnsi(registry).trim());
    }

    async getAuthToken(scope?: string): Promise<string> {
        const possibleRcPaths = [
            path.resolve(this.context, '.npmrc'),
            path.resolve(os.homedir(), '.npmrc'),
        ];

        let npmConfig: Record<string, string> = {};
        for (const loc of possibleRcPaths) {
            if (fs.existsSync(loc)) {
                try {
                    // the closer config file (the one with lower index) takes higher precedence
                    npmConfig = Object.assign(
                        {},
                        ini.parse(fs.readFileSync(loc, 'utf-8')),
                        npmConfig
                    );
                }
                catch (e) {
                    // in case of file permission issues, etc.
                }
            }
        }

        const registry = await this.getRegistry(scope);
        const registryWithoutProtocol = registry
            .replace(/https?:/, '') // remove leading protocol
            .replace(/([^/])$/, '$1/'); // ensure ending with slash
        const authTokenKey = `${registryWithoutProtocol}:_authToken`;

        return npmConfig[authTokenKey];
    }

    async getMetadata(
        packageName: string,
        {full = false} = {}
    ): Promise<Record<string, any>> {
        const scope = extractPackageScope(packageName);
        const registry = await this.getRegistry(scope);

        let metadata;

        const headers: {
            Accept?: string;
            Authorization?: string;
        } = {};
        if (!full) {
            headers.Accept
                = 'application/vnd.npm.install-v1+json;q=1.0, application/json;q=0.9, */*;q=0.8';
        }

        const authToken = await this.getAuthToken(scope);
        if (authToken) {
            headers.Authorization = `Bearer ${authToken}`;
        }

        const url = `${registry.replace(/\/$/g, '')}/${packageName}`;
        try {
            metadata = (await request.get(url, {headers})).body;
            if (metadata.error) {
                throw new Error(metadata.error);
            }

            return metadata;
        }
        catch (e) {
            error(`Failed to get response from ${url}`);

            throw e;
        }
    }

    async getRemoteVersion(
        packageName: string,
        versionRange: string | semver.Range = 'latest'
    ): Promise<string | semver.SemVer | null> {
        const metadata = await this.getMetadata(packageName);
        if (
            Object.keys(metadata['dist-tags']).includes(versionRange as string)
        ) {
            return metadata['dist-tags'][versionRange as string];
        }

        const versions = Array.isArray(metadata.versions)
            ? metadata.versions
            : Object.keys(metadata.versions);

        return semver.maxSatisfying(versions, versionRange);
    }
}
