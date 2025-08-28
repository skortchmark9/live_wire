"""
Email service for sending rate switching authorization documents using AWS SES
"""
import os
import base64
import logging
from typing import Optional, Dict, Any
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # AWS SES configuration
        self.aws_region = os.getenv('AWS_SES_REGION', 'us-east-1')
        self.from_email_address = os.getenv('AWS_SES_FROM_EMAIL', 'noreply@livewire.energy')
        self.from_name = os.getenv('AWS_SES_FROM_NAME', 'Live Wire Energy')
        self.from_email = f"{self.from_name} <{self.from_email_address}>"
        
        # Initialize SES client
        try:
            self.ses_client = boto3.client(
                'ses',
                region_name=self.aws_region,
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
            )
            logger.info("AWS SES client initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to initialize AWS SES client: {str(e)}. Email sending will be disabled.")
            self.ses_client = None
    
    def send_signed_loa_email(
        self, 
        customer_email: str, 
        customer_name: str, 
        pdf_bytes: bytes, 
        pdf_filename: str,
        customer_data: Dict[str, Any]
    ) -> bool:
        """
        Send email with signed LOA attachment to customer and internal team
        
        Args:
            customer_email: Customer's email address
            customer_name: Customer's name
            pdf_bytes: Signed PDF document bytes
            pdf_filename: Name for the PDF attachment
            customer_data: Customer data dictionary
            
        Returns:
            bool: True if email sent successfully, False otherwise
        """
        if not self.ses_client:
            logger.error("AWS SES client not initialized. Cannot send email.")
            return False
        
        try:
            # Create email content
            subject = "✅ Your Electricity Rate Switch Authorization - Signed & Processed"
            html_content = self._create_email_html(customer_name, customer_data)
            
            # Create MIME message
            msg = MIMEMultipart()
            msg['Subject'] = subject
            msg['From'] = self.from_email
            msg['To'] = customer_email
            
            # Add BCC to internal team (optional)
            internal_email = os.getenv('INTERNAL_NOTIFICATIONS_EMAIL')
            if internal_email:
                msg['Bcc'] = internal_email
            
            # Add HTML content
            msg.attach(MIMEText(html_content, 'html'))
            
            # Attach signed PDF
            pdf_attachment = MIMEApplication(pdf_bytes)
            pdf_attachment.add_header(
                'Content-Disposition', 
                'attachment', 
                filename=pdf_filename
            )
            pdf_attachment.add_header('Content-Type', 'application/pdf')
            msg.attach(pdf_attachment)
            
            # Prepare recipient list
            destinations = [customer_email]
            if internal_email:
                destinations.append(internal_email)
            
            # Send email via SES
            response = self.ses_client.send_raw_email(
                Source=self.from_email,
                Destinations=destinations,
                RawMessage={'Data': msg.as_string()}
            )
            
            message_id = response.get('MessageId')
            if message_id:
                logger.info(f"Successfully sent signed LOA email to {customer_email}. Message ID: {message_id}")
                return True
            else:
                logger.error("Failed to send email - no message ID returned")
                return False
                
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logger.error(f"AWS SES error ({error_code}): {error_message}")
            return False
        except Exception as e:
            logger.error(f"Error sending signed LOA email: {str(e)}")
            return False
    
    def _create_email_html(self, customer_name: str, customer_data: Dict[str, Any]) -> str:
        """Create HTML email content for signed LOA notification"""
        
        account_number = customer_data.get('account_number', 'N/A')
        
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Rate Switch Authorization Confirmed</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .success-icon {{ font-size: 48px; color: #28a745; margin-bottom: 10px; }}
                .title {{ color: #28a745; font-size: 24px; font-weight: bold; margin: 0; }}
                .subtitle {{ color: #666; font-size: 16px; margin: 5px 0 0 0; }}
                .content {{ margin: 30px 0; }}
                .info-box {{ background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }}
                .info-item {{ margin: 10px 0; }}
                .info-label {{ font-weight: bold; color: #495057; }}
                .next-steps {{ background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }}
                .step {{ margin: 10px 0; padding: 5px 0; }}
                .step-number {{ display: inline-block; width: 25px; height: 25px; background-color: #2196f3; color: white; text-align: center; border-radius: 50%; font-weight: bold; margin-right: 10px; line-height: 25px; }}
                .attachment-notice {{ background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #666; font-size: 14px; }}
                .contact-info {{ margin: 20px 0; text-align: center; }}
                .contact-info a {{ color: #007bff; text-decoration: none; }}
                .logo {{ color: #007bff; font-size: 20px; font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✅</div>
                    <h1 class="title">Authorization Signed Successfully!</h1>
                    <p class="subtitle">Your electricity rate switch is now in progress</p>
                </div>
                
                <div class="content">
                    <p>Dear {customer_name},</p>
                    
                    <p>Great news! We've received your signed Letter of Authorization for your electricity rate switch. Your document has been processed and is attached to this email for your records.</p>
                    
                    <div class="info-box">
                        <div class="info-item">
                            <span class="info-label">Customer:</span> {customer_name}
                        </div>
                        <div class="info-item">
                            <span class="info-label">Account Number:</span> {account_number}
                        </div>
                        <div class="info-item">
                            <span class="info-label">Document Type:</span> Letter of Authorization (LOA)
                        </div>
                        <div class="info-item">
                            <span class="info-label">Status:</span> ✅ Signed and Processed
                        </div>
                    </div>
                    
                    <div class="attachment-notice">
                        <strong>📎 Attachment:</strong> Your signed authorization document is attached to this email as a PDF. Please save this for your records as it serves as legal proof of your rate switch authorization.
                    </div>
                    
                    <div class="next-steps">
                        <h3 style="color: #1565c0; margin-top: 0;">What Happens Next?</h3>
                        
                        <div class="step">
                            <span class="step-number">1</span>
                            <strong>Document Review:</strong> We'll review your signed authorization for completeness and accuracy.
                        </div>
                        
                        <div class="step">
                            <span class="step-number">2</span>
                            <strong>Con Edison Submission:</strong> Your authorization will be submitted to Con Edison to initiate the rate change process.
                        </div>
                        
                        <div class="step">
                            <span class="step-number">3</span>
                            <strong>Processing Period:</strong> The switch typically takes 1-2 billing cycles to complete.
                        </div>
                        
                        <div class="step">
                            <span class="step-number">4</span>
                            <strong>Confirmation:</strong> You'll receive email updates as your rate switch progresses.
                        </div>
                        
                        <div class="step">
                            <span class="step-number">5</span>
                            <strong>Start Saving:</strong> Once complete, you'll begin seeing savings on your electricity bill!
                        </div>
                    </div>
                    
                    <p><strong>Important Notes:</strong></p>
                    <ul>
                        <li>Your electricity service will not be interrupted during this process</li>
                        <li>You'll continue to receive your regular Con Edison bill</li>
                        <li>The new rate will appear on your next available billing cycle</li>
                        <li>Keep this email and attachment for your records</li>
                    </ul>
                </div>
                
                <div class="contact-info">
                    <p><strong>Questions or concerns?</strong></p>
                    <p>Email us at: <a href="mailto:support@livewire.energy">support@livewire.energy</a></p>
                    <p>We're here to help make your rate switch as smooth as possible!</p>
                </div>
                
                <div class="footer">
                    <div class="logo">Live Wire Energy Solutions</div>
                    <p>Making electricity rates simple and transparent</p>
                    <p style="font-size: 12px; color: #999;">
                        This email was sent because you recently signed an electricity rate authorization with Live Wire Energy Solutions.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

# Create global instance
email_service = EmailService()