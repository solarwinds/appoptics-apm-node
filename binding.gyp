{
  'targets': [
    {
      'target_name': 'node-oboe',
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      'sources': [
        'src/oboe.h',
        'src/node-oboe.cc',
        'src/metadata.h',
        'src/context.h',
        'src/config.h',
        'src/event.h',
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
