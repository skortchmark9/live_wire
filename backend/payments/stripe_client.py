"""
Stripe API client wrapper for payment processing
"""
import os
import stripe
import logging
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

class StripeClient:
    def __init__(self):
        self.stripe_key = os.getenv('STRIPE_SECRET_KEY')
        if not self.stripe_key:
            logger.warning("STRIPE_SECRET_KEY not found in environment variables")
        stripe.api_key = self.stripe_key
        self.webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
        
    def create_checkout_session(
        self,
        price_amount: int,
        product_name: str,
        product_description: str,
        success_url: str,
        cancel_url: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Create a Stripe Checkout Session for one-time payment
        
        Args:
            price_amount: Amount in cents (e.g., 1000 = $10.00)
            product_name: Name of the product/service
            product_description: Description of what's being purchased
            success_url: URL to redirect to after successful payment
            cancel_url: URL to redirect to if payment is cancelled
            metadata: Additional metadata to attach to the session
            
        Returns:
            Stripe Checkout Session object
        """
        try:
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'unit_amount': price_amount,
                        'product_data': {
                            'name': product_name,
                            'description': product_description,
                        },
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata or {},
                customer_email=metadata.get('email') if metadata else None,
            )
            
            logger.info(f"Created checkout session: {session.id}")
            return {
                'id': session.id,
                'url': session.url,
                'status': 'created'
            }
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating checkout session: {str(e)}")
            raise
            
    def verify_webhook_signature(self, payload: bytes, signature: str) -> Dict[str, Any]:
        """
        Verify and parse a Stripe webhook event
        
        Args:
            payload: Raw request body as bytes
            signature: Stripe signature header value
            
        Returns:
            Parsed event object
        """
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, self.webhook_secret
            )
            return event
        except ValueError as e:
            logger.error(f"Invalid webhook payload: {e}")
            raise
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid webhook signature: {e}")
            raise
            
    def retrieve_session(self, session_id: str) -> Dict[str, Any]:
        """
        Retrieve a checkout session by ID to check payment status
        
        Args:
            session_id: The checkout session ID
            
        Returns:
            Session details including payment status
        """
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            return {
                'id': session.id,
                'payment_status': session.payment_status,
                'customer_email': session.customer_email,
                'amount_total': session.amount_total,
                'currency': session.currency,
                'metadata': session.metadata,
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error retrieving session {session_id}: {str(e)}")
            raise
            
    def get_payment_intent(self, payment_intent_id: str) -> Dict[str, Any]:
        """
        Retrieve payment intent details
        
        Args:
            payment_intent_id: The payment intent ID
            
        Returns:
            Payment intent details
        """
        try:
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            return {
                'id': intent.id,
                'status': intent.status,
                'amount': intent.amount,
                'currency': intent.currency,
                'receipt_email': intent.receipt_email,
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error retrieving payment intent {payment_intent_id}: {str(e)}")
            raise

# Global instance
stripe_client = StripeClient()