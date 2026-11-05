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
            'aesthetics': [
                {'element': 'color', 'observation': '暖色木屋与冷色环境形成区别', 'evidence': '右下方木屋偏暖，湖水和远山偏冷。', 'exercise': '下次取景保留两种颜色的邻接关系。', 'confidence': 'medium'},
                {'element': 'space', 'observation': '湖面为木屋提供周围空间', 'evidence': '木屋左侧湖面相对平缓。', 'exercise': '比较保留湖面与收紧取景的区别。', 'confidence': 'medium'}],
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

    def test_invalid_intent_is_rejected(self):
        p = self.payload(); p['intent'] = 'invented'
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
        p = self.payload(); p['gaze'] = 'left'; p['intent'] = 'symmetry'; p['subject'] = {'x': .1, 'y': .2, 'w': .3, 'h': .4}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only'}), patch('urllib.request.urlopen', reply):
            status, data = server.analyze(p)
        self.assertEqual(status, 200); self.assertEqual(data['gaze'], 'left')
        self.assertEqual(data['subject']['x'], .1)
        context = json.loads(captured['input'][0]['content'][0]['text'].split('用户设置：', 1)[1])
        self.assertEqual(context['user_intent'], 'symmetry')
        self.assertFalse(captured['store'])
        self.assertEqual(captured['input'][0]['content'][1]['type'], 'input_image')
        self.assertTrue(captured['text']['format']['strict'])

    def test_aesthetic_observations_require_evidence_and_unique_elements(self):
        for mutate in (lambda d: d.pop('aesthetics'),
                       lambda d: d['aesthetics'][0].update(evidence=''),
                       lambda d: d['aesthetics'][0].update(element='beauty_score'),
                       lambda d: d['aesthetics'][1].update(element='color'),
                       lambda d: d['aesthetics'][0].update(confidence='certain')):
            data = result(); mutate(data)
            with self.assertRaises(ValueError): server.validate_result(data)

    def test_model_refusal_remains_a_visible_error(self):
        response = {'status': 'completed', 'output': [{'content': [{'type': 'refusal', 'refusal': 'unable'}]}]}
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only'}), patch('urllib.request.urlopen', return_value=BytesIO(json.dumps(response).encode())):
            status, data = server.analyze(self.payload())
        self.assertEqual(status, 502); self.assertIn('本地', data['error'])

if __name__ == '__main__': unittest.main()
