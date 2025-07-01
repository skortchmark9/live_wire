export declare const getApiBaseUrl: () => string;
export declare class FetchError extends Error {
    status: number;
    info: unknown;
    constructor(message: string, status: number, info: unknown);
}
export declare const fetcher: (path: string) => Promise<any>;
export declare const postFetcher: (path: string, data: unknown) => Promise<any>;
export declare const swrConfig: {
    fetcher: (path: string) => Promise<any>;
    revalidateOnFocus: boolean;
    revalidateOnReconnect: boolean;
    dedupingInterval: number;
    errorRetryCount: number;
    errorRetryInterval: number;
};
//# sourceMappingURL=swr.d.ts.map