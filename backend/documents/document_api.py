"""
Document API endpoints for LOA generation and signing
"""
import os
import base64
import tempfile
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
import logging

from .document_generator import loa_generator
from user import auth_manager
from email_service import email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

class GenerateLOARequest(BaseModel):
    """Request model for LOA generation"""
    pass  # Will use session data

class SignDocumentRequest(BaseModel):
    """Request model for document signing"""
    signature_data: str  # Base64 encoded signature image
    agreed: bool  # User agreement checkbox

class LOAPreviewResponse(BaseModel):
    """Response model for LOA preview"""
    html_content: str
    customer_name: str
    account_number: str
    date: str

@router.get("/loa-preview")
async def get_loa_preview(request: Request) -> LOAPreviewResponse:
    """
    Generate LOA preview for the current user session
    """
    session_id = request.cookies.get("user_session")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = auth_manager.get_session(session_id)
    if not session or session["status"] != "success":
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check if user has purchased switch service
    payment_status = session.get('payment_status')
    if payment_status != 'completed' and not session.get('switch_purchased'):
        raise HTTPException(status_code=403, detail="Plan switch service not purchased")
    
    # Get rate calculation data for account info
    rate_calc = session.get('rate_calculation')
    if not rate_calc:
        raise HTTPException(status_code=400, detail="No rate calculation found")
    
    # Extract customer data (in a real app, this would come from ConEd API or user profile)
    # For now, we'll use demo data based on the session
    customer_data = {
        'name': extract_customer_name(session.get('username', 'Customer Name')),
        'address': '123 Main Street',  # TODO: Get from ConEd account data
        'city': 'New York',
        'state': 'NY', 
        'zip_code': '10001',
        'account_number': 'DEMO-12345-67890',  # TODO: Get from ConEd API
        'email': session.get('username', 'customer@example.com')
    }
    
    try:
        html_content = loa_generator.create_preview_html(customer_data)
        
        return LOAPreviewResponse(
            html_content=html_content,
            customer_name=customer_data['name'],
            account_number=customer_data['account_number'],
            date=datetime.now().strftime("%B %d, %Y")
        )
        
    except Exception as e:
        logger.error(f"Error generating LOA preview: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate document preview: {str(e)}")

@router.post("/sign-loa")
async def sign_loa(request: Request, sign_request: SignDocumentRequest):
    """
    Process document signature and generate signed PDF
    """
    session_id = request.cookies.get("user_session")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = auth_manager.get_session(session_id)
    if not session or session["status"] != "success":
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check if user has purchased switch service
    payment_status = session.get('payment_status')
    if payment_status != 'completed' and not session.get('switch_purchased'):
        raise HTTPException(status_code=403, detail="Plan switch service not purchased")
    
    if not sign_request.agreed:
        raise HTTPException(status_code=400, detail="You must agree to the authorization")
    
    # Get customer data (same as preview)
    customer_data = {
        'name': extract_customer_name(session.get('username', 'Customer Name')),
        'address': '123 Main Street',  # TODO: Get from ConEd account data
        'city': 'New York',
        'state': 'NY',
        'zip_code': '10001', 
        'account_number': 'DEMO-12345-67890',  # TODO: Get from ConEd API
        'email': session.get('username', 'customer@example.com')
    }
    
    try:
        # Generate signed PDF
        signed_pdf_bytes = loa_generator.create_pdf_with_signature(
            customer_data, 
            sign_request.signature_data
        )
        
        # Store PDF temporarily in /tmp directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_filename = f"signed_loa_{session_id}_{timestamp}.pdf"
        pdf_path = os.path.join("/tmp", pdf_filename)
        
        try:
            with open(pdf_path, 'wb') as f:
                f.write(signed_pdf_bytes)
            logger.info(f"Signed PDF saved to {pdf_path}")
        except Exception as e:
            logger.error(f"Failed to save PDF: {e}")
            # Continue anyway, don't fail the signing process
        
        # Store signing information in session
        session['loa_signed'] = {
            'signed_at': datetime.now().isoformat(),
            'signature_captured': True,
            'customer_ip': request.client.host if request.client else 'unknown',
            'document_hash': hash(signed_pdf_bytes),
            'pdf_path': pdf_path,  # Store path for later retrieval
            'pdf_filename': pdf_filename
        }
        
        session['switch_status'] = 'signed'
        
        logger.info(f"LOA signed by user {session.get('username')} in session {session_id}")
        
        # Send email with signed LOA attachment
        email_sent = False
        try:
            email_sent = email_service.send_signed_loa_email(
                customer_email=customer_data['email'],
                customer_name=customer_data['name'],
                pdf_bytes=signed_pdf_bytes,
                pdf_filename=pdf_filename,
                customer_data=customer_data
            )
            
            if email_sent:
                logger.info(f"Successfully sent signed LOA email to {customer_data['email']}")
                session['loa_signed']['email_sent'] = True
                session['loa_signed']['email_sent_at'] = datetime.now().isoformat()
            else:
                logger.warning(f"Failed to send signed LOA email to {customer_data['email']}")
                session['loa_signed']['email_sent'] = False
                
        except Exception as e:
            logger.error(f"Error sending signed LOA email: {str(e)}")
            session['loa_signed']['email_sent'] = False
        
        return {
            "status": "success",
            "message": "Document signed successfully",
            "signed_at": session['loa_signed']['signed_at'],
            "next_step": "document_submission",
            "email_sent": email_sent
        }
        
    except Exception as e:
        logger.error(f"Error processing signature: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process signature: {str(e)}")

@router.get("/signing-status")
async def get_signing_status(request: Request):
    """
    Get the current signing status for the user
    """
    session_id = request.cookies.get("user_session")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = auth_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    loa_signed = session.get('loa_signed')
    switch_status = session.get('switch_status', 'pending')
    
    return {
        "switch_purchased": session.get('switch_purchased', False),
        "loa_signed": bool(loa_signed),
        "signed_at": loa_signed.get('signed_at') if loa_signed else None,
        "switch_status": switch_status,
        "next_step": determine_next_step(session)
    }

def extract_customer_name(email_or_name: str) -> str:
    """
    Extract a reasonable customer name from email or username
    In production, this would come from ConEd account data
    """
    if '@' in email_or_name:
        # Extract name from email
        local_part = email_or_name.split('@')[0]
        # Convert underscores/dots to spaces and title case
        name = local_part.replace('_', ' ').replace('.', ' ').title()
        return name
    return email_or_name.title()

def determine_next_step(session: dict) -> str:
    """
    Determine the next step in the process based on session state
    """
    if not session.get('switch_purchased'):
        return 'purchase_required'
    elif not session.get('loa_signed'):
        return 'signature_required'
    elif session.get('switch_status') == 'signed':
        return 'submission_pending'
    elif session.get('switch_status') == 'submitted':
        return 'confirmation_pending'
    elif session.get('switch_status') == 'completed':
        return 'process_complete'
    else:
        return 'unknown'