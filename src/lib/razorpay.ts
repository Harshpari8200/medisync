import Razorpay from 'razorpay';

// Initialize Razorpay with your key_id and key_secret
export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

// Helper function to create a Razorpay order
export async function createRazorpayOrder(options: {
  amount: number; // in paise (100 paise = ₹1)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  try {
    const order = await razorpay.orders.create({
      amount: options.amount,
      currency: options.currency || 'INR',
      receipt: options.receipt,
      notes: options.notes || {},
    });
    return { success: true, order };
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return { success: false, error };
  }
}

// Helper function to verify Razorpay payment
export function verifyRazorpayPayment(options: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const { orderId, paymentId, signature } = options;
  
  // Generate the expected signature
  const crypto = require('crypto');
  const text = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(text)
    .digest('hex');
  
  // Compare the signatures
  return { 
    valid: expectedSignature === signature,
    orderId,
    paymentId,
    signature
  };
}
