"""
User authentication module for ConEd login with MFA support
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional, Callable
import logging

logger = logging.getLogger(__name__)

class AuthenticationManager:
    def __init__(self):
        # In-memory storage for pending MFA sessions
        self.mfa_sessions: Dict[str, Dict] = {}
        # Lock for thread-safe operations
        self.lock = asyncio.Lock()
    
    async def create_session(self, username: str, password: str) -> str:
        """
        Create a new authentication session and return session ID
        """
        session_id = str(uuid.uuid4())
        
        async with self.lock:
            # Create an event that will be triggered when MFA is provided
            mfa_event = asyncio.Event()
            
            # Store session info
            self.mfa_sessions[session_id] = {
                "username": username,
                "password": password,
                "mfa_event": mfa_event,
                "mfa_code": None,
                "created_at": datetime.now(),
                "status": "authenticating",
                "error": None,
                "result": None,
                "access_token": None
            }
            
            # Clean up old sessions (older than 5 minutes)
            # await self._cleanup_expired_sessions()
        
        logger.info(f"Created MFA session {session_id} for user {username}")
        return session_id
    
    async def submit_mfa(self, session_id: str, mfa_code: str) -> bool:
        """
        Submit MFA code for a pending session
        Returns True if successful, False if session not found
        """
        async with self.lock:
            session = self.mfa_sessions.get(session_id)
            
            if not session or session["status"] != "mfa_required":
                return False
            
            # Store the MFA code and trigger the event
            session["mfa_code"] = mfa_code
            session["status"] = "mfa_received"
            session["mfa_event"].set()
        
        logger.info(f"MFA code received for session {session_id}")
        return True
    
    async def wait_for_mfa(self, session_id: str, timeout: int = 300) -> Optional[str]:
        """
        Wait for MFA code to be provided for a session
        Returns the MFA code or None if timeout
        """
        session = self.mfa_sessions.get(session_id)
        if not session:
            return None
        
        try:
            # Wait for MFA event with timeout (default 5 minutes)
            await asyncio.wait_for(session["mfa_event"].wait(), timeout=timeout)
            return session.get("mfa_code")
        except asyncio.TimeoutError:
            async with self.lock:
                session["status"] = "timeout"
                session["error"] = "MFA timeout"
            return None
    
    def get_session(self, session_id: str) -> Optional[Dict]:
        """
        Get session information
        """
        return self.mfa_sessions.get(session_id)
    
    async def update_session_status(self, session_id: str, status: str, error: Optional[str] = None, result: Optional[Dict] = None):
        """
        Update session status
        """
        async with self.lock:
            session = self.mfa_sessions.get(session_id)
            if session:
                session["status"] = status
                if error:
                    session["error"] = error
                if result:
                    session["result"] = result
    
    async def authenticate_with_collector(self, session_id: str) -> Dict:
        """
        Authenticate using the electricity collector with MFA callback
        """
        session = self.mfa_sessions.get(session_id)
        if not session:
            return {"status": "error", "error": "Session not found"}
        
        try:
            await self.update_session_status(session_id, "authenticating")
            
            # Import here to avoid circular imports
            import aiohttp
            import sys
            from pathlib import Path
            
            # Add opower to path
            sys.path.insert(0, str(Path(__file__).parent.parent / "opower" / "src"))
            from opower import Opower
            
            # Create MFA callback that waits for the code
            async def mfa_callback():
                # Set status to mfa_required when MFA is needed
                await self.update_session_status(session_id, "mfa_required")
                mfa_code = await self.wait_for_mfa(session_id)
                if not mfa_code:
                    raise Exception("MFA timeout")
                # Set back to authenticating while processing MFA
                await self.update_session_status(session_id, "authenticating")
                return mfa_code
            
            # Login and get access token only
            async with aiohttp.ClientSession() as client_session:
                api = Opower(client_session, "coned", session["username"], session["password"], None)
                await api.async_login(mfa_callback=mfa_callback)
                
                # Store the access token for later use
                session["access_token"] = api.access_token
                logger.info(f"Access token stored for session {session_id}")
                
                # Mark as successful - data collection will happen on separate API calls
                await self.update_session_status(session_id, "success")
                logger.info(f"Authentication successful for session {session_id}")
            
            return {"status": "success", "message": "Authentication completed"}
            
        except Exception as e:
            error_msg = str(e)
            await self.update_session_status(session_id, "failed", error=error_msg)
            logger.error(f"Authentication error for session {session_id}: {error_msg}")
            return {"status": "error", "error": error_msg}
    
    def get_session_access_token(self, session_id: str) -> Optional[str]:
        """
        Get a valid access token for a specific session
        Returns None if no valid token found or session expired
        """
        session = self.mfa_sessions.get(session_id)
        
        if not session or session["status"] != "success":
            return None
            
        access_token = session.get("access_token")
        if not access_token:
            return None
            
        # Check if session is recent (less than 2 hours old)
        age = datetime.now() - session["created_at"]
        if age.total_seconds() < (2 * 3600):  # 2 hours
            logger.info(f"Using cached access token for session {session_id}")
            return access_token
        else:
            # Session expired, remove it
            del self.mfa_sessions[session_id]
            logger.info(f"Session {session_id} expired")
            return None
    
    async def _cleanup_expired_sessions(self):
        """
        Remove sessions older than 5 minutes
        """
        cutoff_time = datetime.now() - timedelta(minutes=5)
        expired_sessions = [
            sid for sid, session in self.mfa_sessions.items()
            if session["created_at"] < cutoff_time
        ]
        for sid in expired_sessions:
            del self.mfa_sessions[sid]
            logger.info(f"Cleaned up expired session {sid}")

# Global instance
auth_manager = AuthenticationManager()