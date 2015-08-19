#
# This Vagrantfile builds a dev box with all the parts needed for testing
#
$script = <<-BASH
sudo apt-get -y update
sudo apt-get -y install software-properties-common python-software-properties \
  build-essential curl git wget unzip libpq-dev

# tracelyzer
wget https://files.appneta.com/install_appneta.sh
sudo sh ./install_appneta.sh f08da708-7f1c-4935-ae2e-122caf1ebe31

# node/nvm
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.25.4/install.sh | bash
echo 'if [[ ":$PATH:" != *":node_modules/.bin:"* ]]; then PATH=${PATH}:node_modules/.bin; fi' >> $HOME/.bashrc
source $HOME/.nvm/nvm.sh
nvm install iojs
nvm alias default iojs
BASH

Vagrant.configure(2) do |config|
  config.vm.box = 'ubuntu/trusty64'

  config.vm.network 'private_network', ip: '192.168.0.123'
  config.vm.synced_folder '.', '/vagrant', id: 'core',
    nfs: true, mount_options: ['nolock,vers=3,udp']

  config.vm.provision 'docker' do |d|
    images = [
      { name: 'mysql', port: 3306, args: '-e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_ROOT_PASSWORD=' },
      { name: 'mongo', port: 27017, tag: '2' },
      { name: 'redis', port: 6379 },
      { name: 'postgres', port: 5432, args: '-e POSTGRES_PASSWORD=' },
      { name: 'cassandra', port: 9042 },
      { name: 'rabbitmq', port: 5672 },
      { name: 'memcached', port: 11211 },
      # { name: 'rethinkdb', port: 8080 },
    ]

    images.each do |image|
      name = image[:name]
      tagged = name
      tagged += ':' + image[:tag] unless image[:tag].nil?
      d.pull_images tagged
      args = (image[:args] || '') + ' '
      d.run name, image: tagged, args: "#{args} -p #{image[:port]}:#{image[:port]}"
    end
  end

  config.vm.provision 'shell', inline: $script, privileged: false

  # Virtualbox VM
  config.vm.provider :virtualbox do |provider|
    # Cap cpu and memory usage
    provider.customize [
      'modifyvm', :id,
      '--memory', 4096,
      '--cpuexecutioncap', 75
    ]

    # Enable symlink support
    provider.customize [
      'setextradata', :id,
      'VBoxInternal2/SharedFoldersEnableSymlinksCreate/v-root', '1'
    ]
  end
end
