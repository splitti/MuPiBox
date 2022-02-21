sudo apt-get install rustc cargo libasound2-dev libssl-dev pkg-config -y
#wget source code (https://github.com/Spotifyd/spotifyd/releases)

cd spotifyd
cargo build --release
The resulting binary will be placed in target/release/spotifyd