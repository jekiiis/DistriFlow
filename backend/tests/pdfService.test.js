'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

const pdfService = require('../src/services/pdfService');

const ORDER = {
  id: 1,
  order_no: 'SO-20261112-001',
  order_date: '2026-11-12',
  customer_code: 'PLG-007',
  customer_name: 'Pelanggan Uji',
  customer_address: 'Bandung',
  customer_phone: '022000000',
  user_name: 'Kasir Uji',
  status: 'LUNAS',
  due_date: null,
  subtotal: '800000.00',
  discount: '50000.00',
  total: '750000.00',
  items: [{
    id: 1,
    code: 'BRS-05',
    name: 'Barang Uji',
    qty: 10,
    unit_price: '75000.00',
    discount: '0.00',
    line_total: '750000.00'
  }],
  payments: [{
    id: 1,
    amount: '800000.00',
    change_amount: '50000.00',
    method: 'TUNAI'
  }]
};

// PDFKit menulis teks sebagai string heksadesimal di dalam content stream.
// Menggabungkan hasil decode setiap string mengembalikan teks yang tertulis.
function decodePdfText(buffer) {
  const source = buffer.toString('latin1');
  return Array.from(source.matchAll(/<([0-9A-Fa-f]+)>/g))
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('');
}

describe('pdfService.buildInvoice', () => {
  test('menghasilkan PDF A4 yang memuat data transaksi', async () => {
    const buffer = await pdfService.buildInvoice(ORDER, 'a4');
    const text = decodePdfText(buffer);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('latin1').startsWith('%PDF')).toBe(true);
    expect(text).toContain('DistriFlow');
    expect(text).toContain('SO-20261112-001');
    expect(text).toContain('Pelanggan Uji');
    expect(text).toContain('Kasir Uji');
    expect(text).toContain('BRS-05');
    expect(text).toContain('Rp800.000');
    expect(text).toContain('Rp50.000');
    expect(text).not.toContain('PPN');
  });

  test('format 80mm menghasilkan PDF yang sama sahnya', async () => {
    const buffer = await pdfService.buildInvoice(ORDER, '80mm');
    expect(buffer.toString('latin1').startsWith('%PDF')).toBe(true);
  });

  test('piutang menampilkan sisa tagihan dan jatuh tempo', async () => {
    const receivable = Object.assign({}, ORDER, {
      status: 'PIUTANG',
      due_date: '2026-12-12',
      payments: [{ id: 1, amount: '250000.00', change_amount: '0.00', method: 'TRANSFER' }]
    });
    const buffer = await pdfService.buildInvoice(receivable, 'a4');
    const text = decodePdfText(buffer);
    expect(text).toContain('Sisa piutang');
    expect(text).toContain('2026-12-12');
    expect(text).toContain('Rp500.000');
  });
});
