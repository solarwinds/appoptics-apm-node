require 'json'
require 'ostruct'

class Port
	attr_accessor :from, :to

	def initialize(port)
		if port.is_a?(Array)
			@from = port[0]
			@to = port[1]
		elsif port.is_a?(Integer)
			@from = @to = port
		elsif port.is_a?(Hash)
			@from = port[:from]
			@to = port[:to]
		else
			raise 'unrecognized port format'
		end
	end

	def to_s
		"-p #{@from}:#{@to}"
	end
end

class Env
	attr_accessor :vars

	def initialize(vars)
		@vars = vars
	end

	def to_s
		list = []
		@vars.each do |key, value|
			list << "-e #{key}=#{value}"
		end
		list.join ' '
	end
end

class TaggedImage
	attr_accessor :name, :image, :tag

	def initialize(data)
		@tag = data[:tag]
		@name = data[:name]
		@image = data[:image].nil? ? @name : data[:image]
	end

	def to_s
		full_image
	end

	private

	def image_name
		@image.nil? ? @name : @image
	end

	def full_image
		name = image_name
		@tag.nil? ? name : "#{name}:#{@tag}"
	end
end

class Image
	attr_accessor :name, :image, :ports

	def initialize(data)
		@name = data[:name]
		@image = TaggedImage.new(data)
		@env = Env.new(data[:env] || Hash.new)
		@ports = (data[:ports] || []).map { |port| Port.new(port) } || []
	end

	def to_s
		args = []
		port_args = @ports.map { |port| port.to_s }
		args += port_args unless port_args.nil?

		"docker run -d --name #{@name} #{args.join ' '} #{@env.to_s} #{@image.to_s}"
	end

	def self.load(path)
		parse(File.read(path))
	end
	def self.parse(data)
		JSON.parse(data, symbolize_names: true).map do |image|
			Image.new(image)
		end
	end
end

images = Image.load('docker-containers.json')
images.each do |cmd|
	v = cmd.to_s
	puts v
	system v
end
