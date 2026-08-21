import jwt
import requests
import wave
import struct
import math

# 1. Create a dummy 2-second WAV file
file_name = 'test_audio.wav'
sample_rate = 44100.0
duration = 2.0
frequency = 440.0

with wave.open(file_name, 'w') as wave_file:
    wave_file.setnchannels(1)
    wave_file.setsampwidth(2)
    wave_file.setframerate(sample_rate)
    
    for i in range(int(sample_rate * duration)):
        value = int(32767.0 * math.sin(frequency * math.pi * 2 * (i / sample_rate)))
        data = struct.pack('<h', value)
        wave_file.writeframesraw(data)

print("Generated dummy audio.")

# 2. Mint JWT
secret = 'super_secret_jwt_string_12345'
token = jwt.encode({'role': 'admin', 'username': 'Satyam9877'}, secret, algorithm='HS256')

# 3. Upload to API
url = 'http://localhost:3000/api/admin/songs'
headers = {'Authorization': f'Bearer {token}'}
data = {
    'title': 'Test Song',
    'film': 'Test Film',
    'year': '2026',
    'rotation': 'night-bass',
    'tags': 'test'
}

with open(file_name, 'rb') as f:
    files = {'audio': (file_name, f, 'audio/wav')}
    response = requests.post(url, headers=headers, data=data, files=files)

print("Upload Response:", response.status_code)
print(response.json())
