import requests

def internet():
    try:
        response = requests.get("https://www.google.com", timeout=5)
        print("true") if response.status_code == 200 else print("false")
#        return response.status_code == 200
    except requests.RequestException:
        print("false")
#        return False

internet()

#import socket

#def internet(host="1.1.1.1", port=53, timeout=10):
#    try:
#        socket.setdefaulttimeout(timeout)
#        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
#        print("true")
#        #return "True"
#    except socket.error as ex:
#        #print(ex)
#        print("false")
#        #return "False"

#internet()
