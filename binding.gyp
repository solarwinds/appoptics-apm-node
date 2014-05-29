{
  'targets': [
    {
      'target_name': 'node-oboe',
      'include_dirs': [
        "<!(node -e \"require('nan')\")"
      ],
      'sources': [
        'src/node-oboe.cc'
      ],
      'conditions': [
        ['OS=="linux"', {
          'libraries': [
            '-loboe'
          ],
          'ldflags': [
            '-Wl,-rpath /usr/local/lib'
          ]
        }]
      ]
    }
  ]
}
