import Stripe from 'stripe';
import pino from 'pino';

const logger = pino({ name: 'stripe-processor' });

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  chargeId?: string;
  error?: string;
}

/**
 * StripeProcessor — handles payment collection for completed charging sessions.
 *
 * Payment flow:
 * 1. Session starts: optionally pre-authorize a hold on driver's card
 * 2. Session ends: capture final amount based on actual energy/time consumed
 * 3. Partial refund if pre-auth was higher than actual cost
 *
 * Supported payment methods:
 *   - Credit/debit card (saved in Stripe via SetupIntent)
 *   - Apple Pay / Google Pay (via Stripe Payment Request Button)
 *   - RFID account billing (charge stored payment method on file)
 *
 * Multi-currency: Stripe handles FX; amounts stored in lowest denomination (cents)
 */
export class StripeProcessor {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' });
  }

  async chargeStoredMethod(
    customerId: string,
    paymentMethodId: string,
    amountCents: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: currency.toLowerCase(),
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        metadata,
        description: `EV Charging Session — ${metadata.session_id}`,
      });

      logger.info({
        paymentIntentId: paymentIntent.id,
        amount: amountCents,
        currency,
      }, 'Payment captured');

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        chargeId: paymentIntent.latest_charge as string,
      };
    } catch (err) {
      const error = err as Stripe.errors.StripeError;
      logger.error({ error: error.message, code: error.code }, 'Payment failed');

      // Handle card declined, insufficient funds, etc.
      return { success: false, error: error.message };
    }
  }

  async createSetupIntent(customerId: string): Promise<string> {
    const intent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    return intent.client_secret!;
  }

  async refund(chargeId: string, amountCents: number): Promise<boolean> {
    try {
      await this.stripe.refunds.create({ charge: chargeId, amount: amountCents });
      return true;
    } catch (err) {
      logger.error({ err }, 'Refund failed');
      return false;
    }
  }

  async createCustomer(email: string, name: string): Promise<string> {
    const customer = await this.stripe.customers.create({ email, name });
    return customer.id;
  }
}
