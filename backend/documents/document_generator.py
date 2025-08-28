"""
Document generation for Letter of Authorization (LOA)
Based on the ISKCON LOA template format
"""
import os
from datetime import datetime
from typing import Dict, Any, Optional
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas
from io import BytesIO
import base64
import logging

logger = logging.getLogger(__name__)

class LOAGenerator:
    def __init__(self, company_name: str = "Live Wire Energy Solutions"):
        self.company_name = company_name
        self.styles = getSampleStyleSheet()
        
        # Custom styles
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Title'],
            fontSize=16,
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        self.body_style = ParagraphStyle(
            'CustomBody',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=12,
            alignment=TA_LEFT,
            fontName='Helvetica'
        )
        
        self.signature_style = ParagraphStyle(
            'SignatureStyle',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            alignment=TA_LEFT,
            fontName='Helvetica'
        )

    def generate_loa_content(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate LOA content based on customer data
        
        Args:
            customer_data: Dictionary containing:
                - name: Customer name
                - address: Customer address
                - city: City
                - state: State
                - zip_code: ZIP code
                - account_number: ConEd account number
                - email: Customer email
        
        Returns:
            Dictionary with LOA content and metadata
        """
        current_date = datetime.now().strftime("%B %d, %Y")
        
        # Format customer address
        full_address = f"{customer_data.get('address', '')}"
        city_state_zip = f"{customer_data.get('city', '')}, {customer_data.get('state', '')} {customer_data.get('zip_code', '')}"
        
        loa_content = {
            'title': 'LETTER OF AUTHORIZATION',
            'date': current_date,
            'customer_name': customer_data.get('name', ''),
            'customer_address': full_address,
            'city_state_zip': city_state_zip,
            'account_number': customer_data.get('account_number', ''),
            'company_name': self.company_name,
            'authorization_text': (
                f"This letter is to authorize {self.company_name} to act as our agent and "
                "request information related to our billing and metering for utility service, "
                "negotiate resolutions to billing issues, make elections available under the "
                "terms of Con Edison's tariffs, and request changes be made to the rates "
                "under which we take service."
            )
        }
        
        return loa_content

    def create_pdf_with_signature(self, customer_data: Dict[str, Any], signature_data: Optional[str] = None) -> bytes:
        """
        Create a PDF LOA document with optional signature
        
        Args:
            customer_data: Customer information
            signature_data: Base64 encoded signature image (optional)
            
        Returns:
            PDF bytes
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=1*inch)
        story = []
        
        loa_content = self.generate_loa_content(customer_data)
        
        # Title
        title_para = Paragraph(loa_content['title'], self.title_style)
        story.append(title_para)
        story.append(Spacer(1, 20))
        
        # Date
        date_para = Paragraph(loa_content['date'], self.body_style)
        story.append(date_para)
        story.append(Spacer(1, 20))
        
        # Customer info
        customer_info = f"""
        {loa_content['customer_name']}<br/>
        {loa_content['customer_address']}<br/>
        {loa_content['city_state_zip']}
        """
        customer_para = Paragraph(customer_info, self.body_style)
        story.append(customer_para)
        story.append(Spacer(1, 20))
        
        # Account number
        account_para = Paragraph(f"Con Edison Account #: {loa_content['account_number']}", self.body_style)
        story.append(account_para)
        story.append(Spacer(1, 20))
        
        # Authorization text
        auth_para = Paragraph(loa_content['authorization_text'], self.body_style)
        story.append(auth_para)
        story.append(Spacer(1, 40))
        
        # Signature section
        signature_line = f"{loa_content['customer_name']}: "
        if signature_data:
            # Add signature image if provided
            story.append(Paragraph(signature_line, self.signature_style))
            try:
                # Decode base64 signature
                signature_bytes = base64.b64decode(signature_data.split(',')[1])  # Remove data:image/png;base64, prefix
                sig_buffer = BytesIO(signature_bytes)
                sig_image = Image(sig_buffer, width=200, height=50)
                story.append(sig_image)
            except Exception as e:
                logger.error(f"Error processing signature: {e}")
                story.append(Paragraph("_" * 50, self.signature_style))
        else:
            story.append(Paragraph(signature_line + "_" * 50, self.signature_style))
        
        story.append(Spacer(1, 20))
        
        # Title line
        title_para = Paragraph("Title: Account Holder", self.signature_style)
        story.append(title_para)
        
        # Build PDF
        doc.build(story)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        return pdf_bytes

    def create_preview_html(self, customer_data: Dict[str, Any]) -> str:
        """
        Create HTML preview of the LOA document
        
        Args:
            customer_data: Customer information
            
        Returns:
            HTML string for preview
        """
        loa_content = self.generate_loa_content(customer_data)
        
        html_template = f"""
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px; font-family: 'Times New Roman', serif;">
            <h1 style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 30px;">
                {loa_content['title']}
            </h1>
            
            <p style="margin-bottom: 20px; font-size: 12px;">
                {loa_content['date']}
            </p>
            
            <div style="margin-bottom: 20px; font-size: 12px;">
                {loa_content['customer_name']}<br/>
                {loa_content['customer_address']}<br/>
                {loa_content['city_state_zip']}
            </div>
            
            <p style="margin-bottom: 20px; font-size: 12px;">
                <strong>Con Edison Account #:</strong> {loa_content['account_number']}
            </p>
            
            <p style="margin-bottom: 40px; font-size: 12px; line-height: 1.5;">
                {loa_content['authorization_text']}
            </p>
            
            <div style="margin-bottom: 20px; font-size: 12px;">
                <strong>{loa_content['customer_name']}:</strong> <span style="border-bottom: 2px solid #000; display: inline-block; width: 200px; height: 20px;"></span>
            </div>
            
            <p style="font-size: 12px;">
                <strong>Title:</strong> Account Holder
            </p>
        </div>
        """
        
        return html_template

# Global instance
loa_generator = LOAGenerator()