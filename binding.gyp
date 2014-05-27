{
  'targets': [
    {
      'target_name': 'node-oboe',
      'cflags': [
        '-fvisibility=hidden',
        '-fno-exceptions',
        '-fno-rtti',
        '-Wall',
        '-Wextra',
      ],
      # Need to repeat the compiler flags in xcode-specific lingo,
      # gyp on mac ignores the cflags field.
      'xcode_settings': {
        'GCC_ENABLE_CPP_EXCEPTIONS': 'NO',
        'GCC_ENABLE_CPP_RTTI': 'NO',
        # -Wno-invalid-offsetof is only necessary for gcc 4.2,
        # it prints bogus warnings for POD types.
        'GCC_WARN_ABOUT_INVALID_OFFSETOF_MACRO': 'NO',
        # -fvisibility=hidden
        'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES',
        'WARNING_CFLAGS': ['-Wall', '-Wextra'],
      },
      'sources': [
        'src/oboe.h',
        'src/node-oboe.cc',
        'src/node-oboe.h',
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
