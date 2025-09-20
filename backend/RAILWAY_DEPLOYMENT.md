# Railway Deployment Guide

This guide explains how to deploy the ConEd Rate Calculator backend to Railway.

## Prerequisites

1. **OAuth Setup Complete**: You must run the application locally first to complete the OAuth flow
2. **Google APIs Enabled**: Google Sheets API and Google Drive API must be enabled in your Google Cloud project
3. **Railway Account**: Sign up at https://railway.app/

## Step 1: Local OAuth Setup

1. **Run the application locally** (this only needs to be done once):
   ```bash
   cd backend
   source venv/bin/activate
   python test_google_oauth.py
   ```

2. **OAuth Flow**: A browser will open asking you to authorize the application
3. **Token Generated**: The app will create `rates/token.json` with your OAuth tokens

## Step 2: Extract Railway Environment Variables

The test script will output the environment variables needed for Railway:

```
🚀 Railway Environment Variables:
GOOGLE_OAUTH_REFRESH_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_TEMPLATE_ID=...
GOOGLE_FOLDER_ID=...
```

**⚠️ Important**: Keep these values secure! The refresh token allows access to your Google account.

## Step 3: Railway Deployment

### 3.1 Create Railway Project
1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Choose **"Deploy from GitHub repo"**
4. Connect your GitHub repository
5. Select the repository containing your backend code

### 3.2 Configure Environment Variables
In the Railway dashboard, go to **Variables** tab and add.

## Token Maintenance

### When Tokens Expire
OAuth refresh tokens typically last 6+ months. When they expire:

1. **Symptoms**: Railway app returns authentication errors
2. **Solution**: 
   - Run `python test_google_oauth.py` locally
   - Copy new environment variables to Railway
   - Redeploy

### Monitoring
- **Railway Logs**: Check for Google API authentication errors
- **Set Alerts**: Monitor for 401/403 errors from Google APIs
- **Test Regularly**: Run rate calculations to keep tokens active

## Security Notes

1. **Never commit tokens** to git (already in `.gitignore`)
2. **Rotate tokens** if compromised
3. **Use Railway's secure** environment variable storage
4. **Monitor access logs** in Google Cloud Console

## Troubleshooting

### "Module not found" errors
- Check `requirements.txt` includes all Google API dependencies
- Verify Railway is using Python 3.8+

### "Authentication failed" errors  
- Verify environment variables are set correctly
- Check token hasn't expired
- Ensure Google APIs are enabled

### "403 Forbidden" errors
- Verify Google Drive folder permissions
- Check API quotas in Google Cloud Console
- Ensure template is shared with your account

### File upload failures
- Confirm folder ID is correct
- Check Google Drive storage quota
- Verify OAuth scopes include Drive access
