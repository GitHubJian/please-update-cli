import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';
import semver from 'semver';

export function hasYarn(): boolean {
    try {
        execSync('yarn --version', {stdio: 'ignore'});
        return true;
    }
    catch (e) {
        return false;
    }
}

function checkYarn(result: boolean): boolean {
    if (result && !hasYarn()) {
        throw new Error(
            'The project seems to require yarn but it\'s not installed.'
        );
    }

    return result;
}

export function hasProjectYarn(cwd: string): boolean {
    const lockFile = path.join(cwd, 'yarn.lock');
    const result = fs.existsSync(lockFile);
    return checkYarn(result);
}

let _hasPnpm;
let _pnpmVersion;

function getPnpmVersion(): semver.SemVer {
    try {
        _pnpmVersion = execSync('pnpm --version', {
            stdio: ['pipe', 'pipe', 'ignore'],
        }).toString();
        // there's a critical bug in pnpm 2
        // https://github.com/pnpm/pnpm/issues/1678#issuecomment-469981972
        // so we only support pnpm >= 3.0.0
        _hasPnpm = true;
    }
    catch (e) {}

    return _pnpmVersion || '0.0.0';
}

export function hasPnpmVersionOrLater(
    version: string | semver.SemVer
): boolean {
    return semver.gte(getPnpmVersion(), version);
}

export function hasPnpm3OrLater(): boolean {
    return hasPnpmVersionOrLater('3.0.0');
}

function checkPnpm(result: boolean): boolean {
    if (result && !hasPnpm3OrLater()) {
        throw new Error(
            `The project seems to require pnpm${
                _hasPnpm ? ' >= 3' : ''
            } but it's not installed.`
        );
    }

    return result;
}

export function hasProjectPnpm(cwd: string): boolean {
    const lockFile = path.join(cwd, 'pnpm-lock.yaml');
    const result = fs.existsSync(lockFile);
    return checkPnpm(result);
}

export function hasProjectNpm(cwd: string): boolean {
    const lockFile = path.join(cwd, 'package-lock.json');
    const result = fs.existsSync(lockFile);
    return result;
}
