#!/bin/sh
# Installer for TraceView (https://traceview.solarwinds.com)
#
# installs AppOptics's "appoptics" daemon and "liboboe"
# instrumentation support library
# network performance manager.
#
# (c) 2016 SolarWinds, LLC

command_exists() {
    hash "$1" > /dev/null 2>&1
}

apt_get_install() {
    if [ "$CODENAME" = etch ]; then
        apt-get -y install $*
    else
        apt-get -y --no-install-recommends install $*
    fi
}

repository_connectivity_test() {
    if [ -f /etc/debian_version ]; then
        DOMAIN=$(cat /etc/apt/sources.list.d/traceview.list | awk '{ print $2"/dists/"$3 }')
        URLS="$DOMAIN/Release.gpg $DOMAIN/Release"
    elif [ -f /etc/redhat-release ] || [ -f /etc/system-release-cpe ] || [ -f /etc/fedora-release ]; then
        DOMAIN=$(cat /etc/yum.repos.d/traceview.repo | grep baseurl | awk -F= '{ print $2 }')
        URLS="$DOMAIN/repodata/repomd.xml"
    fi
    echo -n "=== Testing connectivity to package repository..."

    if command_exists wget; then
        FETCH="wget -qO- --timeout=10 --tries=1"
    elif command_exists curl; then
        FETCH="curl -f -m 10 --retry 1"
    else
        echo "failed (Need either wget or curl)."
        return 1
    fi
    # BAM - the repos are not needed
    return 0

    for URL in $URLS; do
        $FETCH $URL >/dev/null 2>&1
        if [ $? = 0 ]; then
            echo "done."
            return 0
        fi
        echo -n "."
    done
    echo "failed."
    return 1
}

debian_package_installed() {
    STATUS=$(dpkg-query -W -f='${Status}\n' "$1" 2>/dev/null)
    if [ "$?" = 0 ]; then
        echo "$STATUS" | grep " installed$" > /dev/null
    else
        false
    fi
}

redhat_package_installed() {
    rpm --quiet -q "$1" 2>/dev/null
}

echo_banner() {
    echo "=== $1"
}

exit_with_error() {
    echo "=== ERROR: $1"
    sleep 1
    exit 1
}

exit_if_unpriv() {
    _UID=$(id -u)
    if [ "$_UID" != 0 ]; then
        if command_exists sudo; then
            exit_with_error \
                "Installer must be run as root (try running installer with sudo)."
        else
            exit_with_error "Installer must be run as root."
        fi
    fi
}

suggest_next_steps() {
    if [ "$1" = debian ]; then
        PKG_LIST="apache2.2-common%libapache2-mod-oboe php5-common%php-oboe"
        IS_INSTALLED_FUNC=debian_package_installed
        PKG_INSTALL_CMD="apt-get install"
    elif [ "$1" = redhat ]; then
        PKG_LIST="httpd%libapache2-mod-oboe php-common%php-oboe"
        IS_INSTALLED_FUNC=redhat_package_installed
        PKG_INSTALL_CMD="yum install"
    fi

    unset PREREQ_LIST
    unset SUGGEST_LIST
    for PAIR in $PKG_LIST; do
        PREREQ=$(echo "$PAIR" | cut -f1 -d%)
        SUGGEST=$(echo "$PAIR" | cut -f2 -d%)
        if "$IS_INSTALLED_FUNC" "$PREREQ"; then
            PREREQ_LIST="$PREREQ_LIST $PREREQ"
            SUGGEST_LIST="$SUGGEST_LIST $SUGGEST"
        fi
    done

    if [ "$PREREQ_LIST" ]; then
        echo_banner "TraceView agent extensions are available for the following packages" nosleep
        echo_banner "installed on this system:${PREREQ_LIST}" nosleep
        echo_banner "" nosleep
        echo_banner "To install instrumentation for these components, run as root:" nosleep
        echo_banner "" nosleep
        echo_banner "    ${PKG_INSTALL_CMD}${SUGGEST_LIST}" nosleep
        echo_banner "" nosleep
        echo_banner "For help instrumenting other components in your stack (such as Ruby," nosleep
        echo_banner "Python, etc), you may visit:" nosleep
        echo_banner "    https://docs.traceview.solarwinds.com/installation-overview" nosleep
        echo_banner ""
    fi
}

run_installer() {
    set -e

    exit_if_unpriv
    if [ -f /etc/debian_version ]; then
        install_debian
    elif [ -f /etc/redhat-release ]; then
        install_redhat
    elif [ -f /etc/system-release-cpe ]; then
        install_redhat
    elif [ -f /etc/fedora-release ]; then
        install_redhat
    else
        exit_with_error "Unable to detect operating system."
    fi
}

get_platform_desc() {
    # Note: Order of checking is important because some platforms share same file names but with different function.
    # Keep this order: redhat based -> ubuntu -> debian
    if [ -f /etc/redhat-release ]; then # Redhat, CentOS, Fedora
        PLATFORM_DESC=$(cat /etc/redhat-release | head -n1)
    elif [ -f /etc/system-release-cpe ]; then # Amazon Linux
        PLATFORM_DESC="Amzn Linux "$(cat /etc/system-release-cpe 2>/dev/null | grep ':amazon:linux:' | awk -F: {'print $5'})
        if [ "$PLATFORM_DESC" = "Amzn Linux " ]; then
            PLATFORM_DESC="Amzn Linux unknown"
        fi
    elif [ -f /etc/lsb-release ]; then # Ubuntu
        PLATFORM_DESC=$(cat /etc/lsb-release | grep DISTRIB_DESCRIPTION | awk -F= {'print $2'} | sed 's/"//g')
        if [ -z "$PLATFORM_DESC" ]; then
            PLATFORM_DESC="Ubuntu unknown"
        fi
    elif [ -f /etc/debian_version ]; then # Debian
        PLATFORM_DESC="Debian "$(cat /etc/debian_version | head -n1)
    elif [ -f /etc/SuSE-release ]; then # Novell SuSE
        PLATFORM_DESC=$(cat /etc/SuSE-release | head -n1)
    elif [ -f /etc/slackware-version ]; then # Slackware
        PLATFORM_DESC=$(cat /etc/slackware-version | head -n1)
    elif [ -f /etc/gentoo-release ]; then # Gentoo
        PLATFORM_DESC=$(cat /etc/gentoo-release | head -n1)
    else
        PLATFORM_DESC="Unknown"
    fi

    echo "Linux ($PLATFORM_DESC)"
}

log_error() {
    sync # prevent race condition in case the tmp file hasn't been written yet
    ERROR_LOG=$(cat ${ERROR_FILE}.tmp)

    echo "+++ $(date +'%Y-%m-%d %H:%M:%S') +++" > $ERROR_FILE
    echo "ClientId=$ACCESS_KEY" >> $ERROR_FILE
    echo "HostId=$(cat /sys/class/net/*/address 2>/dev/null | tr '\n' '-' | md5sum | cut -c1-8)" >> $ERROR_FILE
    echo "Hostname=$(hostname -f 2>/dev/null)" >> $ERROR_FILE
    echo "Platform=$(get_platform_desc)" >> $ERROR_FILE
    echo "Versions=$(/usr/bin/tracelyzer -V 2>/dev/null | grep -v Usage | tr '\n' ',' | sed 's/,$//')" >> $ERROR_FILE
    echo "Mode=Installation" >> $ERROR_FILE
    echo "Class=INSTALL_SCRIPT" >> $ERROR_FILE
    echo "Msg=Error during script install_traceview.sh" >> $ERROR_FILE
    if [ -n "$ERROR_LOG" ]; then
        echo "--- DETAILED ---" >> $ERROR_FILE
        echo "$ERROR_LOG" >> $ERROR_FILE
        echo "----------------" >> $ERROR_FILE
    fi
}

send_logs() {
    # temporarily disable reporting for now...
    return

    set +e
    [ -e /tmp/TRACELYZER_NO_ERROR_REPORTING ] && return
    if [ -e $ERROR_FILE ]; then
        echo -n "Sending report..."
        SUCCESS=n
        for PORT in $ERROR_SERVER_PORTS; do
            if [ "$PORT" = "443" ]; then
                PROTOCOL=https
            else
                PROTOCOL=http
            fi
            POST_CMD=nop
            if command_exists curl; then
                POST_CMD="curl --data-binary @$ERROR_FILE -m 5 -k $PROTOCOL://$ERROR_SERVER:$PORT/$ERROR_SERVER_SCRIPT -H \"Content-Type:text/plain\""
            elif command_exists wget; then
                POST_CMD="wget -qO- --post-file=$ERROR_FILE --timeout=5 --tries=1 --no-check-certificate $PROTOCOL://$ERROR_SERVER:$PORT/$ERROR_SERVER_SCRIPT"
            fi
            eval $POST_CMD 1>/dev/null 2>&1
            if [ $? = 0 ]; then
                SUCCESS=y
                break
            fi
            echo -n "."
        done
        if [ "$SUCCESS" = "y" ]; then
            echo "done."
        else
            echo "failed."
        fi
    fi
}

onError() {
    local EXIT_STATUS=$?
    set +e
    log_error
    send_logs
    # create flag that's checked in case of subsequent successful installation
    touch /tmp/TRACELYZER_INSTALLATION_FAILED
    cleanUp
    echo_banner "Installation was not successful." nosleep
    echo_banner "Please contact traceviewsupport@solarwinds.com or visit https://tracelytics.freshdesk.com for assistance." nosleep
    [ -e $ERROR_RETURN_CODE ] && echo $EXIT_STATUS > $ERROR_RETURN_CODE
}

cleanUp() {
    local EXIT_STATUS=$?
    rm -f ${ERROR_FILE}*
    [ -e $ERROR_RETURN_CODE ] && echo $EXIT_STATUS > $ERROR_RETURN_CODE
}

install_debian() {

    #
    # check for install dependencies, satisfy basic ones automatically:
    #

    command_exists apt-get || exit_with_error "Command 'apt-get' not found."
    command_exists apt-key || exit_with_error "Command 'apt-key' not found."

    # Check if apt-get would run smoothly or if there's any pre-existing broken packages
    echo_banner "Checking for broken packages."
    APT_BROKEN="$(apt-get install -fsy 2>&1 | egrep 'not fully installed or removed|dpkg was interrupted|The following' | grep -v 'no longer required' || true)"
    if [ -n "$APT_BROKEN" ]; then
        exit_with_error "Detected broken packages. Please run 'sudo apt-get install -f' to correct those."
    fi

    if [ "$STATIC" = "YES" ]; then
        APT_SERVER="apt-static.appneta.com"
        CONFIG_SERVER="config-static.appneta.com"
        if [ -e /etc/default/tracelyzer ] && [ -n "$(grep "STATIC_IP=" /etc/default/tracelyzer)" ]; then
            sed -i 's/.*STATIC_IP=.*/STATIC_IP=YES/g' /etc/default/tracelyzer
        else
            echo >> /etc/default/tracelyzer
            echo "# Connect to static IP host" >> /etc/default/tracelyzer
            echo "STATIC_IP=YES" >> /etc/default/tracelyzer
        fi
    else
        APT_SERVER="apt.tv.solarwinds.com"
        CONFIG_SERVER="config.tv.solarwinds.com"
        if [ -e /etc/default/tracelyzer ] && [ -n "$(grep "^STATIC_IP=" /etc/default/tracelyzer)" ]; then
            sed -i 's/^STATIC_IP=.*/STATIC_IP=NO/g' /etc/default/tracelyzer
        fi
    fi

    if command_exists wget; then
        FETCH_KEY_CMD="wget --timeout=10 --tries=1"
        CHECK_ID_CMD="wget --timeout=10 --tries=1 --server-response --spider \"https://$CONFIG_SERVER/config/fetch?accesskey=$ACCESS_KEY&file=collector.conf\" 2>&1 | awk '/^  HTTP/{print \$2}'"
    else
        if ! command_exists curl; then
            echo_banner "Installing curl."
            apt_get_install curl
        fi
        FETCH_KEY_CMD="curl -m 10 --retry 1 -o tracelytics-apt-key.pub"
        CHECK_ID_CMD="curl -m 10 --retry 1 -sL -w \"%{http_code}\\\\n\" \"https://$CONFIG_SERVER/config/fetch?accesskey=$ACCESS_KEY&file=collector.conf\" -o /dev/null"
    fi

    if [ "$SKIP_CERTS" = NO ]; then
        if ! debian_package_installed ca-certificates; then
            echo_banner "Installing ca-certificates."
            apt_get_install ca-certificates
        fi
    fi

    #
    # detect flavor:
    #

    unset CODENAME
    set +e # (allow 'lsb_release', 'grep' to fail in this section)
    # does lsb_release run successfully?
    if command_exists lsb_release; then
        CODENAME=$(lsb_release -s -c 2>/dev/null)
        [ "$?" = 0 ] || unset CODENAME
    fi
    # if not, can the information be successfully parsed from /etc/lsb-release?
    if [ -z "$CODENAME" -a -f /etc/lsb-release ]; then
        CODENAME_LINE=$(grep "^DISTRIB_CODENAME=" /etc/lsb-release 2>/dev/null)
        if [ "$?" = 0 -a "$CODENAME_LINE" ]; then
            CODENAME=$(echo $CODENAME_LINE | cut -f2 -d=)
        fi
    fi
    # if not, can the information be successfully parsed from /etc/debian_version?
    if [ -z "$CODENAME" -a -f /etc/debian_version ]; then
        DEBIAN_VERSION=$(cat /etc/debian_version 2>/dev/null)
        if [ "$DEBIAN_VERSION" = 4 -o \
             "$(echo "$DEBIAN_VERSION" | cut -c-2)" = 4. ]; then
            CODENAME=etch
        elif [ "$DEBIAN_VERSION" = 5 -o \
             "$(echo "$DEBIAN_VERSION" | cut -c-2)" = 5. ]; then
            CODENAME=lenny
        elif [ "$DEBIAN_VERSION" = 6 -o \
             "$(echo "$DEBIAN_VERSION" | cut -c-2)" = 6. ]; then
            CODENAME=squeeze
        elif [ "$DEBIAN_VERSION" = 7 -o \
             "$(echo "$DEBIAN_VERSION" | cut -c-2)" = 7. ]; then
            CODENAME=wheezy
        elif [ "$DEBIAN_VERSION" = 8 -o \
             "$(echo "$DEBIAN_VERSION" | cut -c-2)" = 8. ]; then
            CODENAME=jessie
        fi
    fi
    set -e

    case "$CODENAME" in
        hardy|intrepid|lucid|maverick|natty|oneiric|precise|quantal|raring|saucy|trusty|utopic|vivid|wily|xenial|etch|lenny|squeeze|wheezy|jessie) ;;
        lisa)
            CODENAME=oneiric ;;
        "")
            exit_with_error "Unable to detect operating system, or operating system not supported." ;;
        *)
            exit_with_error "Operating system $CODENAME not supported." ;;
    esac

    #
    # add apt source:
    #
    echo_banner "Adding Traceview APT package repository to system list."
    [ -d /etc/apt/sources.list.d ] \
        || exit_with_error "Required directory /etc/apt/sources.list.d not found."
    cd /etc/apt/sources.list.d
    echo "deb http://$APT_SERVER/$ACCESS_KEY $CODENAME main" > traceview.list

    #
    # download/register public key for package signatures:
    #

    echo_banner "Downloading Traceview package signature public key."
    # stay in /etc/apt/sources.list.d for download of key
    rm -f tracelytics-apt-key.pub*
    $FETCH_KEY_CMD https://$APT_SERVER/tracelytics-apt-key.pub
    [ -s tracelytics-apt-key.pub ] || exit_with_error "Download failed. Please make sure a firewall is not blocking outgoing connections on port 443."
    echo_banner "Adding Traceview package signature public key to system list."
    apt-key add tracelytics-apt-key.pub
    rm -f tracelytics-apt-key.pub
    cd - > /dev/null # back from /etc/apt/sources.list

    # check for valid client ID
    echo_banner "Checking for valid Access key."
    set +e
    RET_VAL=$(eval "$CHECK_ID_CMD")
    if [ "$RET_VAL" != 200 ]; then
        E_MSG="Check failed. Either there are problems connecting to the TraceView key authentication server"
        E_MSG="$E_MSG or your access key $ACCESS_KEY is invalid. Please make sure your firewall is not blocking"
        E_MSG="$E_MSG outbound traffic to $CONFIG_SERVER port 443, and you can find your access key"
        E_MSG="$E_MSG by visiting https://login.tv.solarwinds.com/organization"
        exit_with_error "$E_MSG"
    fi
    set -e

    #
    # pull package index
    #

    # repo connectivity test
    set +e
    if ! repository_connectivity_test; then
        exit_with_error "Could not connect to apt repository. Please make sure a firewall is not blocking outgoing connections on port 80."
    fi
    set -e

    echo_banner "Downloading Traceview package index."
    # allow apt-get update to fail, in case an unrelated repo is down
    set +e
    apt-get update
    if [ "$?" != 0 ]; then
        echo_banner "Executing 'apt-get update' failed; continuing anyway."
    fi
    set -e

    #
    # install base packages:
    #

    # [ao] don't install liboboe - it comes with appoptics-bindings
    # OK, back to installing them as they are needed for the daemon(s)
    echo_banner "Installing common library and development headers (liboboe)."
    apt_get_install liboboe0 liboboe-dev

    echo "tracelyzer.access_key=$ACCESS_KEY" > /etc/tracelytics.conf

    echo_banner "Installing the tracelyzer (performance aggregator daemon)."
    # step 1: download tracelyzer (report any errors that might happen here)
    apt-get -y install tracelyzer -d
    # temporarily disable error reporting while installing the tracelyzer
    # because tracelyzer installation hooks have error reporting themselves
    trap "cleanUp" EXIT
    # step 2: install tracelyzer (let installation hooks take care of error reporting)
    apt_get_install tracelyzer
    # re-enable error reporting
    if [ "$ERROR_TEE_SUPPORT" = "y" ]; then
        trap "onError" EXIT
    fi

    # debian: no use for this file, just delete it
    rm -f /tmp/tracelyzer_install_hook_error.status

    #
    # suggest next steps:
    #

    suggest_next_steps debian
}

install_redhat() {

    #
    # check for install dependencies:
    #

    command_exists yum || exit_with_error "Command 'yum' not found."
    [ -x /sbin/chkconfig ] || exit_with_error "Command 'chkconfig' not found."
    [ -x /sbin/service ] || exit_with_error "Command 'service' not found."

    if [ "$STATIC" = "YES" ]; then
        YUM_SERVER="yum-static.appneta.com"
        CONFIG_SERVER="config-static.appneta.com"
        if [ -e /etc/sysconfig/tracelyzer ] && [ -n "$(grep "STATIC_IP=" /etc/sysconfig/tracelyzer)" ]; then
            sed -i 's/.*STATIC_IP=.*/STATIC_IP=YES/g' /etc/sysconfig/tracelyzer
        else
            echo >> /etc/sysconfig/tracelyzer
            echo "# Connect to static IP host" >> /etc/sysconfig/tracelyzer
            echo "STATIC_IP=YES" >> /etc/sysconfig/tracelyzer
        fi
    else
        YUM_SERVER="yum.tv.solarwinds.com"
        CONFIG_SERVER="config.tv.solarwinds.com"
        if [ -e /etc/sysconfig/tracelyzer ] && [ -n "$(grep "^STATIC_IP=" /etc/sysconfig/tracelyzer)" ]; then
            sed -i 's/^STATIC_IP=.*/STATIC_IP=NO/g' /etc/sysconfig/tracelyzer
        fi
    fi

    if command_exists wget; then
        FETCH_KEY_CMD="wget --timeout=10 --tries=1"
        CHECK_ID_CMD="wget --timeout=10 --tries=1 --server-response --spider \"https://$CONFIG_SERVER/config/fetch?accesskey=$ACCESS_KEY&file=collector.conf\" 2>&1 | awk '/^  HTTP/{print \$2}'"
    else
        if ! command_exists curl; then
            echo_banner "Installing curl."
            yum -y install curl
        fi
        FETCH_KEY_CMD="curl -m 10 --retry 1 -o RPM-GPG-KEY-tracelytics"
        CHECK_ID_CMD="curl -m 10 --retry 1 -sL -w \"%{http_code}\\\\n\" \"https://$CONFIG_SERVER/config/fetch?accesskey=$ACCESS_KEY&file=collector.conf\" -o /dev/null"
    fi

    if [ "$SKIP_CERTS" = NO ]; then
        if ! redhat_package_installed ca-certificates; then
            echo_banner "Installing ca-certificates."
            yum -y install ca-certificates
        fi
    fi

    #
    # detect flavor:
    #

    unset RELEASE
    if cat /etc/redhat-release 2>/dev/null | grep -q "^CentOS release "; then
        RELEASE=$(head -n1 /etc/redhat-release 2>/dev/null | cut -f3 -d' ' | cut -f1 -d.)
    elif cat /etc/redhat-release 2>/dev/null | grep -q "^CentOS Linux release "; then
        RELEASE=$(head -n1 /etc/redhat-release 2>/dev/null | cut -f4 -d' ' | cut -f1 -d.)
    elif cat /etc/redhat-release 2>/dev/null | grep -q "^Red Hat Enterprise Linux "; then
        RELEASE=$(head -n1 /etc/redhat-release 2>/dev/null | cut -f7 -d' ' | cut -f1 -d.)
        IS_RHEL_WORKSTATION=
        if ! cat /etc/redhat-release 2>/dev/null | grep -q "Server release "; then
            IS_RHEL_WORKSTATION=y
        fi
    elif cat /etc/redhat-release 2>/dev/null | grep -q "^Scientific Linux release "; then
        RELEASE=$(head -n1 /etc/redhat-release 2>/dev/null | cut -f4 -d' ' | cut -f1 -d.)
    elif cat /etc/system-release-cpe 2>/dev/null | grep -q ":amazon:linux:"; then
        RELEASE=$(head -n1 /etc/system-release-cpe | awk -F: {' print $5 '} | sed 's/\./-/g')
    elif cat /etc/fedora-release 2>/dev/null | grep -q "Fedora release"; then
        RELEASE=6
    fi

    if [ -z "$RELEASE" ]; then
        if [ -f /etc/redhat-release ]; then
            RELEASE=$(cat /etc/redhat-release | head -n1)
        elif [ -f /etc/fedora-release ]; then
            RELEASE=$(cat /etc/fedora-release | head -n1)
        elif [ -f /etc/system-release-cpe ]; then
            RELEASE=$(cat /etc/system-release-cpe | head -n1)
        else
            exit_with_error "Could not detect Linux Flavor."
        fi
        exit_with_error "Linux Flavor \"$RELEASE\" is not supported."
    fi

    ARCH=$(uname -m)
    case "$ARCH" in *86) ARCH=i386; esac

    SUPPORTED_RELEASES="5-i386 5-x86_64 6-i386 6-x86_64 7-x86_64 2013-09-i386 2013-09-x86_64 2014-03-i386 2014-03-x86_64 2014-09-i386 2014-09-x86_64 2015-03-x86_64 2015-09-x86_64 2016-03-x86_64 2016-09-x86_64 2017-03-x86_64"
    FOUND_RELEASE=n
    for SUPPORTED_RELEASE in $SUPPORTED_RELEASES; do
        if [ "${RELEASE}-${ARCH}" = "$SUPPORTED_RELEASE" ]; then
            FOUND_RELEASE=y
            break
        fi
    done
    if [ "$FOUND_RELEASE" = "n" ]; then
        exit_with_error "Architecture ${RELEASE}-${ARCH} not supported. Supported architectures are: $SUPPORTED_RELEASES"
    fi

    #
    # add yum source:
    #
    rm -f RPM-GPG-KEY-tracelytics*
    echo_banner "Download Traceview RPM package signature public key."
    $FETCH_KEY_CMD https://$YUM_SERVER/RPM-GPG-KEY-tracelytics
    [ -s RPM-GPG-KEY-tracelytics ] || exit_with_error "Download of RPM GPG key failed. Please make sure a firewall is not blocking outgoing connections on port 443."
    mkdir -p /etc/pki/rpm-gpg
    mv RPM-GPG-KEY-tracelytics /etc/pki/rpm-gpg/

    echo_banner "Adding Traceview YUM package repository to system list."
    [ -d /etc/yum.repos.d ] || exit_with_error "Required directory /etc/yum.repos.d not found."
    cat > /etc/yum.repos.d/traceview.repo << EOF
[traceview]
name=Traceview
baseurl=http://${YUM_SERVER}/${ACCESS_KEY}/${RELEASE}/${ARCH}
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-tracelytics
gpgcheck=1
EOF

    # check for valid client ID
    echo_banner "Checking for valid Access key."
    set +e
    RET_VAL=$(eval "$CHECK_ID_CMD")
    if [ "$RET_VAL" != 200 ]; then
        E_MSG="Check failed. Either there are problems connecting to the TraceView key authentication server"
        E_MSG="$E_MSG or your access key $ACCESS_KEY is invalid. Please make sure your firewall is not blocking"
        E_MSG="$E_MSG outbound traffic to $CONFIG_SERVER port 443, and you can find your access key"
        E_MSG="$E_MSG by visiting https://login.tv.solarwinds.com/organization"
        exit_with_error "$E_MSG"
    fi
    set -e

    # Amazon Linux: adjust repo priority (http://aws.amazon.com/amazon-linux-ami/faqs/#epel)
    if cat /etc/system-release-cpe 2>/dev/null | grep -q ":amazon:linux:"; then
        echo "priority=10" >> /etc/yum.repos.d/traceview.repo
    fi

    # repo connectivity test
    set +e
    if ! repository_connectivity_test; then
        exit_with_error "Could not connect to yum repository. Please make sure a firewall is not blocking outgoing connections on port 80."
    fi
    set -e

    #
    # pull package index and install base packages:
    #

    echo_banner \
        "Downloading Traceview package index and installing base packages."
    echo "tracelyzer.access_key=$ACCESS_KEY" > /etc/tracelytics.conf
    yum -y install liboboe liboboe-devel

    set +e
    # temporarily disable error reporting while installing the tracelyzer
    # because tracelyzer installation hooks have error reporting themselves
    trap "cleanUp" EXIT
    yum -y install tracelyzer
    set -e

    # workaround for yum/rpm bug (http://lists.baseurl.org/pipermail/yum/2011-April/023646.html)
    if [ -e /tmp/tracelyzer_install_hook_error.status ] && [ "$(cat /tmp/tracelyzer_install_hook_error.status | head -n1)" != "0" ]; then
        rm -f /tmp/tracelyzer_install_hook_error.status
        rpm -e tracelyzer
        exit 1
    else
        rm -f /tmp/tracelyzer_install_hook_error.status
    fi

    # re-enable error reporting
    if [ "$ERROR_TEE_SUPPORT" = "y" ]; then
        trap "onError" EXIT
    fi

    #
    # configure base packages:
    #

    echo_banner "Registering tracelyzer daemon in rc.d to start on system boot."
    /sbin/chkconfig --add tracelyzer

    suggest_next_steps redhat
}

print_usage_and_exit() {
    echo "Usage: $0 [--no-ca-cert] [--static] ACCESS_KEY"
    echo "--no-ca-cert: skip checking and installing of ca-certificates"
    echo "--static: use static IP host instead of dynamic IP host (for retrieving configuration and package repository)"
    echo "You can find your access key by visiting:"
    echo "  https://login.tv.solarwinds.com/organization"
    exit 1
}

#
# main entry point
#

ERROR_FILE=/tmp/tracelyzer_install_script_error.log
ERROR_RETURN_CODE=/tmp/tracelyzer_install_script_error.status
ERROR_SERVER=installreports.tv.appneta.com
ERROR_SERVER_PORTS="80 443 2222"
ERROR_SERVER_SCRIPT=log/install
ERROR_TEE_SUPPORT=n

# ensures that a copy of stdout is written to a file
if command_exists tee; then
    if [ "$SELF_LOGGING_SCRIPT" != 1 ]; then   # note: variable SELF_LOGGING_SCRIPT is also used in file 'pre_post_functions'
        SCRIPTPATH=$(cd $(dirname $0); pwd -P)
        SCRIPTNAME=$(basename $0)
        echo 1 > $ERROR_RETURN_CODE
        SELF_LOGGING_SCRIPT=1 sh $SCRIPTPATH/$SCRIPTNAME "$1" "$2" "$3" "$4" 2>&1 | tee ${ERROR_FILE}.tmp
        STATUS=$(cat $ERROR_RETURN_CODE)
        rm -f $ERROR_RETURN_CODE
        exit $STATUS
    fi
    ERROR_TEE_SUPPORT=y
    # catch EXIT signal
    trap "onError" EXIT
fi

SKIP_CERTS=NO
STATIC=NO
ACCESS_KEY=

for i in "$1" "$2" "$3" "$4"; do
    if [ -n "$i" ]; then
        case $i in
            --no-ca-cert)
            SKIP_CERTS=YES
            ;;
            --static)
            STATIC=YES
            ;;
            --sequencer=*) # keep obsolete option for backward compatibility
            ;;
            *)
            if [ -z "$(echo $i | grep '^-')" ]; then
                ACCESS_KEY="$i"
                export ACCESS_KEY
            else
                echo "Unknown option: $i"
                print_usage_and_exit
            fi
            ;;
        esac
    fi
done

if [ -z "$ACCESS_KEY" ]; then
    print_usage_and_exit
fi

echo_banner "Welcome to the TraceView installer."

echo_banner "This script will now install the tracelyzer, which collects performance data for TraceView."

run_installer
ret=$?

trap "cleanUp" EXIT

if [ "$IS_RHEL_WORKSTATION" = "y" ]; then
    echo_banner "IMPORTANT NOTE: RHEL Workstation detected. Similar to RedHat policy on Workstation and Client, Traceview software installed \
on those editions are also supported but only at a best-effort level, and only for pre-production environments." nosleep
fi

if [ "$ret" = 0 ]; then
    echo_banner "Installation was successful." nosleep
    echo_banner \
        "Please visit your dashboard at https://login.tv.solarwinds.com to continue the setup process." nosleep
    exit 0
else
    echo_banner "Installation was not successful." nosleep
    echo_banner "If you are having difficulties resolving this issue, please contact our customer care team via traceviewsupport@solarwinds.com" nosleep
    exit 1
fi