"""
Payment API endpoints for Stripe integration
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from .stripe_client import stripe_client
from user import auth_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments", tags=["payments"])

class CreateCheckoutRequest(BaseModel):
    session_id: str  # User session ID
    product_type: str  # e.g., "rate_analysis", "premium_report", etc.
    price_amount: int  # Amount in cents
    product_name: str
    product_description: str

class PaymentProduct(BaseModel):
    """Predefined payment products"""
    id: str
    name: str
    description: str
    price: int  # in cents

# Predefined products - you can customize these
PRODUCTS = {
    "rate_analysis": PaymentProduct(
        id="rate_analysis",
        name="Electricity Rate Analysis",
        description="Comprehensive analysis of your electricity usage and rate optimization",
        price=2999  # $29.99
    ),
    "premium_report": PaymentProduct(
        id="premium_report", 
        name="Premium Energy Report",
        description="Detailed energy usage report with savings recommendations",
        price=4999  # $49.99
    ),
    "consultation": PaymentProduct(
        id="consultation",
        name="Energy Consultation",
        description="1-on-1 consultation with energy efficiency expert",
        price=9999  # $99.99
    )
}

@router.post("/create-checkout-session")
async def create_checkout_session(request: CreateCheckoutRequest):
    """
    Create a Stripe Checkout session for one-time payment
    """
    # Verify user session exists and is authenticated
    session = auth_manager.get_session(request.session_id)
    if not session or session["status"] not in ["success", "authenticated"]:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    # Block demo sessions from making payments
    if session.get("is_demo"):
        raise HTTPException(status_code=403, detail="Demo accounts cannot make purchases. Please login with a real account.")
    
    # Get product details (either from request or predefined)
    if request.product_type in PRODUCTS:
        product = PRODUCTS[request.product_type]
        price_amount = product.price
        product_name = product.name
        product_description = product.description
    else:
        # Use custom product from request
        price_amount = request.price_amount
        product_name = request.product_name
        product_description = request.product_description
    
    from urllib.parse import urlparse
    
    # Get origin from request headers
    origin = request.headers.get('origin') or request.headers.get('referer')
    if origin:
        # Parse and use just the scheme + netloc
        parsed = urlparse(origin)
        app_domain = f"{parsed.scheme}://{parsed.netloc}"
    else:
        # No fallback - require origin header
        raise HTTPException(status_code=400, detail="Origin header required")
    
    success_url = f"{app_domain}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{app_domain}/pricing"
    
    try:
        # Create Stripe checkout session with metadata
        checkout_session = stripe_client.create_checkout_session(
            price_amount=price_amount,
            product_name=product_name,
            product_description=product_description,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                'user_session_id': request.session_id,
                'username': session.get('username', ''),
                'product_type': request.product_type,
                'email': session.get('username', '')  # Assuming username is email
            }
        )
        
        # Store payment session info in auth manager
        await auth_manager.store_payment_session(
            user_session_id=request.session_id,
            stripe_session_id=checkout_session['id'],
            product_type=request.product_type,
            amount=price_amount
        )
        
        logger.info(f"Created checkout session {checkout_session['id']} for user {session.get('username')}")
        
        return {
            'checkout_url': checkout_session['url'],
            'session_id': checkout_session['id']
        }
        
    except Exception as e:
        logger.error(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment session: {str(e)}")

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhook events
    """
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")
    
    try:
        # Verify webhook signature and parse event
        event = stripe_client.verify_webhook_signature(payload, sig_header)
        
        # Handle different event types
        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            
            # Update payment status in our system
            metadata = session.get('metadata', {})
            user_session_id = metadata.get('user_session_id')
            
            if user_session_id:
                await auth_manager.update_payment_status(
                    user_session_id=user_session_id,
                    stripe_session_id=session['id'],
                    status='completed',
                    payment_intent=session.get('payment_intent')
                )
                
                logger.info(f"Payment completed for session {user_session_id}, Stripe session {session['id']}")
            
        elif event['type'] == 'checkout.session.expired':
            session = event['data']['object']
            metadata = session.get('metadata', {})
            user_session_id = metadata.get('user_session_id')
            
            if user_session_id:
                await auth_manager.update_payment_status(
                    user_session_id=user_session_id,
                    stripe_session_id=session['id'],
                    status='expired'
                )
                
                logger.info(f"Payment expired for session {user_session_id}")
                
        return {"status": "success"}
        
    except ValueError as e:
        logger.error(f"Invalid webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")

@router.get("/verify/{stripe_session_id}")
async def verify_payment(stripe_session_id: str, user_session_id: Optional[str] = None):
    """
    Verify payment status for a Stripe session
    """
    try:
        # Retrieve session details from Stripe
        session_details = stripe_client.retrieve_session(stripe_session_id)
        
        # Optionally verify against our records
        if user_session_id:
            payment_record = await auth_manager.get_payment_session(user_session_id)
            if payment_record and payment_record.get('stripe_session_id') != stripe_session_id:
                raise HTTPException(status_code=400, detail="Session mismatch")
        
        return {
            'payment_status': session_details['payment_status'],
            'amount': session_details['amount_total'],
            'currency': session_details['currency'],
            'customer_email': session_details['customer_email'],
            'product_type': session_details['metadata'].get('product_type')
        }
        
    except Exception as e:
        logger.error(f"Error verifying payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to verify payment: {str(e)}")

@router.get("/products")
async def get_products():
    """
    Get available products and pricing
    """
    return {
        "products": [product.dict() for product in PRODUCTS.values()]
    }

@router.get("/status/{user_session_id}")
async def get_payment_status(user_session_id: str):
    """
    Get payment status for a user session
    """
    payment_session = await auth_manager.get_payment_session(user_session_id)
    
    if not payment_session:
        return {"status": "no_payment"}
    
    return {
        "status": payment_session.get('status', 'pending'),
        "product_type": payment_session.get('product_type'),
        "amount": payment_session.get('amount'),
        "stripe_session_id": payment_session.get('stripe_session_id')
    }