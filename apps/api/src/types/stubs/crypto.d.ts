declare module 'crypto' {
    export function createHash(algorithm: 'sha256' | 'md5' | string): Hash;

    interface Hash {
        update(data: string, inputEncoding?: 'utf8' | 'ascii' | 'binary'): Hash;
        digest(encoding: 'hex' | 'latin1' | 'base64'): string;
    }
}