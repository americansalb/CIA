// Test Configuration File
// Update the TEST_CONFIGS object in app.js with your actual Bunny.net CDN URLs

/*
Example structure for each test variant:

TEST_CONFIGS = {
  'Test_A1': {
    segments: [
      'https://your-bunny-cdn.b-cdn.net/cia/test_a1/segment_001.mp3',
      'https://your-bunny-cdn.b-cdn.net/cia/test_a1/segment_002.mp3',
      'https://your-bunny-cdn.b-cdn.net/cia/test_a1/segment_003.mp3',
      // ... add more segments
    ]
  },
  'Test_A2': {
    segments: [
      'https://your-bunny-cdn.b-cdn.net/cia/test_a2/segment_001.mp3',
      'https://your-bunny-cdn.b-cdn.net/cia/test_a2/segment_002.mp3',
      // ... add more segments
    ]
  },
  'Test_B1': {
    segments: [
      'https://your-bunny-cdn.b-cdn.net/cia/test_b1/segment_001.mp3',
      // ... add more segments
    ]
  },
  // Add more test variants as needed...
};

Instructions:
1. Upload your audio files to Bunny.net CDN
2. Organize them by test variant (Test_A1, Test_A2, etc.)
3. Copy the public CDN URLs for each segment
4. Update the TEST_CONFIGS object in /public/js/app.js with your URLs
5. Ensure segments are in the correct order

Audio file requirements:
- Format: MP3 (recommended) or other web-compatible formats
- Quality: Good enough for clear speech understanding
- Naming: Use consistent naming (segment_001, segment_002, etc.)
*/
