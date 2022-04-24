import { requestUrl } from 'obsidian';

/**
 * wrapper around the requestUrl function so fetch can be used in obsidian
 * @param url
 * @param params 
 * @returns
 */
export const fetch = async (url: string, params: any = {}): Promise<any> => {

    const input: any = params;
    input.url = url

    const r = await requestUrl(input);

    // convert the r.json to r.json();
    const json = r.json;
    delete r.json;
    r.json = () => json;

    return r;
}
