Pod::Spec.new do |s|
  s.name           = 'SystemLlm'
  s.version        = '1.0.0'
  s.summary        = 'The OS on-device language model (Apple Intelligence) for the Healthy coach.'
  s.description    = 'Local Expo module wrapping the Foundation Models framework (ADR-008).'
  s.license        = 'MIT'
  s.author         = 'Healthy'
  s.homepage       = 'https://github.com/voslartomas/healthy'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Weak-linked: FoundationModels only exists on iOS 26+, and the app still
  # supports older iOS — every use is behind `#available(iOS 26.0, *)`.
  s.weak_frameworks = 'FoundationModels'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
