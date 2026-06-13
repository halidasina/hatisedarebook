exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let name, email;
  try {
    const body = JSON.parse(event.body);
    name = body.name?.trim();
    email = body.email?.trim().toLowerCase();
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!name || !email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nama dan emel diperlukan' }) };
  }

  // Encode name+email in reference so callback can retrieve them
  const ref = `${name}||${email}`;

  const params = new URLSearchParams({
    userSecretKey: process.env.TOYYIBPAY_SECRET_KEY,
    categoryCode: 'bwt8ar9l',
    billName: 'Hati Sedar - Lifetime Access',
    billDescription: 'Akses seumur hidup Muhasabah Journal',
    billPriceSetting: '1',
    billPayorInfo: '1',
    billAmount: '1490',
    billReturnUrl: 'https://mymuhasabahjournal.netlify.app/journal.html',
    billCallbackUrl: 'https://mymuhasabahjournal.netlify.app/.netlify/functions/toyyibpay-callback',
    billExternalReferenceNo: ref,
    billTo: name,
    billEmail: email,
    billPhone: '',
    billSplitPayment: '0',
    billSplitPaymentArgs: '',
    billPaymentChannel: '0',
    billContentEmail: '',
    billChargeToCustomer: '0',
    billDisplayMerchant: '1',
  });

  try {
    const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
      method: 'POST',
      body: params,
    });

    const data = await response.json();

    if (!data || !data[0] || !data[0].BillCode) {
      console.error('ToyyibPay error:', JSON.stringify(data));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Gagal mencipta bil' }) };
    }

    const billCode = data[0].BillCode;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: `https://toyyibpay.com/${billCode}` }),
    };
  } catch (err) {
    console.error('create-bill error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
  }
};
