import os
import uvicorn

if __name__ == "__main__":
    # Reads the assigned port from the cloud system, or defaults to 8000 locally
    port = int(os.environ.get("PORT", 8000))
    
    # Setting host to 0.0.0.0 allows public web traffic to reach the app
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)