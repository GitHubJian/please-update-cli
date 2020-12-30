import util from 'util';
import request$1 from 'request';

const rify = util.promisify(request$1);

export const request = {
    get(uri: string, opts: Record<string, any>): Promise<any> {
        // lazy require
        const reqOpts = {
            method: 'GET',
            timeout: 30000,
            resolveWithFullResponse: true,
            json: true,
            uri,
            ...opts,
        };

        return rify(reqOpts);
    },
};
