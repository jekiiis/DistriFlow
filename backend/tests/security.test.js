'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

const request = require('supertest');
const app = require('../src/app');

describe('header keamanan dan respons 404', () => {
  test('path API tidak dikenal menghasilkan 404 seragam dengan header keamanan', async () => {
    const response = await request(app).get('/api/path-yang-tidak-ada');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'Endpoint tidak ditemukan'
    });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('path non-API juga menghasilkan 404 seragam', async () => {
    const response = await request(app).get('/halaman-tidak-ada');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Halaman tidak ditemukan');
  });
});
