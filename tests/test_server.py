import base64
from io import BytesIO
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

PHOTO = Path(__file__).resolve().parents[1] / 'dist' / 'demo.jpg'

def result():
    return {'subject': {'x': .5, 'y': .5, 'w': .2, 'h': .3, 'label': '木屋', 'confidence': 'high'},
            'horizon': None, 'gaze': 'none', 'summary': '木屋位于右侧。',
            'tips': [{'title': '减少干扰', 'body': '尝试降低机位，观察树枝是否移出画面。'},
                     {'title': '保留倒影', 'body': '取景时检查底部是否保留完整倒影。'}]}

class ServerTests(unittest.TestCase):
    def payload(self):
        return {'image': 'data:image/jpeg;base64,' + base64.b64encode(PHOTO.read_bytes()).decode(), 'gaze': 'unknown'}

    def test_no_key_returns_explicit_unavailable(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
            status, body = server.analyze(self.payload())
        self.assertEqual(status, 503)
        self.assertIn('本地', body['error'])

    def test_rejects_invalid_image_and_subject(self):
        for payload in ({}, {'image': 'https://example.org/photo.jpg'}, {'image': 'data:image/jpeg;base64,@@@@'}):
            with self.assertRaises(ValueError): server.analyze(payload)
        p = self.payload(); p['subject'] = {'x': .8, 'y': 0, 'w': .5, 'h': .2}
        with self.assertRaises(ValueError): server.analyze(p)

    def test_invalid_model_coordinates_are_not_used(self):
        data = result(); data['subject']['x'] = float('nan')
        with self.assertRaises(ValueError): server.validate_result(data)
        data = result(); data['subject']['w'] = 2
        with self.assertRaises(ValueError): server.validate_result(data)

    def test_responses_contract_and_manual_overrides_with_mock(self):
        captured = {}
        def reply(request, timeout):
            captured.update(json.loads(request.data))
            return BytesIO(json.dumps({'status': 'completed', 'output': [{'type': 'message', 'content': [
                {'type': 'output_text', 'text': json.dumps(result())}]}]}).encode())
        p = self.payload(); p['gaze'] = 'left'; p['subject'] = {'x': .1, 'y': .2, 'w': .3, 'h': .4}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only'}), patch('urllib.request.urlopen', reply):
            status, data = server.analyze(p)
        self.assertEqual(status, 200); self.assertEqual(data['gaze'], 'left')
        self.assertEqual(data['subject']['x'], .1)
        self.assertFalse(captured['store'])
        self.assertEqual(captured['input'][0]['content'][1]['type'], 'input_image')
        self.assertTrue(captured['text']['format']['strict'])

    def test_model_refusal_remains_a_visible_error(self):
        response = {'status': 'completed', 'output': [{'content': [{'type': 'refusal', 'refusal': 'unable'}]}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only'}), patch('urllib.request.urlopen', return_value=BytesIO(json.dumps(response).encode())):
            status, data = server.analyze(self.payload())
        self.assertEqual(status, 502); self.assertIn('本地', data['error'])

if __name__ == '__main__': unittest.main()
