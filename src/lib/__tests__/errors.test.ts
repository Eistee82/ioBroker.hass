import { describe, it, expect } from 'vitest';
import { errorMsg, redactSecrets } from '../errors.js';

describe('errorMsg', () => {
    it('extracts message from Error instance', () => {
        expect(errorMsg(new Error('boom'))).toBe('boom');
    });

    it('returns string input as-is', () => {
        expect(errorMsg('plain')).toBe('plain');
    });

    it('stringifies object input', () => {
        expect(errorMsg({ code: 42 })).toBe('{"code":42}');
    });

    it('handles null and undefined gracefully', () => {
        expect(errorMsg(null)).toBe('null');
        expect(errorMsg(undefined)).toBe('undefined');
    });

    it('redacts JWT-like tokens', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0In0.xxxxxxxxxxxx';
        expect(errorMsg(`auth failed: ${jwt} oops`)).toBe('auth failed: [redacted-token] oops');
    });

    it('redacts PEM private keys', () => {
        const pem = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';
        expect(redactSecrets(`cert load failed ${pem} here`)).toContain('[redacted-private-key]');
    });
});
