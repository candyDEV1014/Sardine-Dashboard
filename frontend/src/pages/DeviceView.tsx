import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Card, OverlayTrigger, Tooltip } from "react-bootstrap";
import { GrLocation } from "react-icons/gr";
import { HeaderOnlyError } from "components/Error/HeaderOnlyError";
import { BehaviorBiometricsPerFlow, DeviceProfile, AnyTodo } from "sardine-dashboard-typescript-definitions";
import { DeviceProfileHit } from "utils/api_response/deviceResponse";
import BehaviorBiometrics from "components/BehaviorBiometrics";
import { replaceAllUnderscoresWithSpaces } from "utils/stringUtils";
import { RULE_DETAILS_PATH, SEARCH_PARAM_KEYS } from "modulePaths";
import { captureException } from "utils/errorUtils";
import { selectIsSuperAdmin, useUserStore } from "store/user";
import Layout from "../components/Layout/Main";
import Loader from "../components/Common/Loader";
import { CustomerProfileLink, Link } from "../components/Common/Links";
import { StoreCtx } from "../utils/store";
import { StyledNavTitle, StyledStickyNav, StyledTitleName } from "../components/Dashboard/styles";
import { StyledMainDiv, InputGroupWrapper, PinContainer } from "../components/FraudScore/styles";
import { ActionTypes } from "../utils/store/actionTypes";
import { fetchDeviceProfile } from "../utils/api";
import { FraudListProps } from "../utils/store/interface";
import {
  DetailsHeaderParent,
  BorderHide,
  StyledTableCell,
  StyledCard,
  DetailsHeaderChild,
  DetailsHeaderValue,
  DetailsHeaderTile,
} from "../components/Customers/styles";
import CircularRiskLevel from "../components/Common/CircularRiskLevel";
import Badge from "../components/Common/Badge";
import ExecutedRulesList from "../components/Common/ExecutedRulesList";
import { useGetFallbackHistoryState } from "../utils/openUrlNewTabWithHistoryState";
import { getSourceFromQueryParams } from "../components/FraudScore";
import { getClientFromQueryParams } from "../utils/getClientFromQueryParams";
import { CLIENT_ID_QUERY_FIELD } from "../utils/constructFiltersQueryParams";
import deviceIcon from "../utils/logo/device.svg";
import executedRulesIcon from "../utils/logo/executed_rules.svg";
import cloudIcon from "../utils/logo/cloud.svg";
import osIcon from "../utils/logo/os.svg";

const PARAM_KEYS = SEARCH_PARAM_KEYS[RULE_DETAILS_PATH];

interface StateData {
  data: AnyTodo;
  payload: AnyTodo;
}

interface DefinitionObject {
  key: string;
  icon: string;
  value: { [key: string]: string };
}

interface DeviceObject {
  name: string;
  icon: string;
  value: FeatureObject[];
}

interface FeatureObject {
  name: string;
  description: string;
  value: AnyTodo;
}

const QUERY_PARAMS_SESSION_KEY = "session";

function getSessionKeyFromQueryParams(pathSearch: string): string {
  const searchParams = new URLSearchParams(pathSearch);
  const sessionKey: string | null = searchParams.get(QUERY_PARAMS_SESSION_KEY);
  if (sessionKey === null) {
    return "";
  }
  return sessionKey;
}

const DeviceView: React.FC = () => {
  const { dispatch } = useContext(StoreCtx);
  const navigate = useNavigate();
  const [deviceData, setDeviceData] = useState<DeviceObject[]>([]);
  const [userId, setUserId] = useState("");
  const [session_key, setSessionKey] = useState("");
  const [sessionRisk, setSessionRisk] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [clientID, setClientID] = useState("");
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [listPayload, setListPayload] = useState<FraudListProps>();

  const { organisationFromUserStore, isSuperAdmin, setUserStoreOrganisation } = useUserStore((state) => {
    const { organisation, setUserStoreOrganisation } = state;
    return {
      organisationFromUserStore: organisation,
      isSuperAdmin: selectIsSuperAdmin(state),
      setUserStoreOrganisation,
    };
  });

  const { search } = useLocation();
  const [searchPath] = useSearchParams();
  const [behaviorBiometrics, setBehaviorBiometrics] = useState<Array<BehaviorBiometricsPerFlow>>([]);
  const details = useGetFallbackHistoryState<StateData>();
  const sessionKeyFromQP = getSessionKeyFromQueryParams(search);
  const dbSource = getSourceFromQueryParams(search, isSuperAdmin);

  const organisation = getClientFromQueryParams(search, isSuperAdmin, organisationFromUserStore);
  const clientIdFromQP = searchPath.get(CLIENT_ID_QUERY_FIELD);

  const featuresWithLevel = ["device_reputation", "proxy", "vpn", "os_anomaly", "session_risk"];
  const definitions: DefinitionObject[] = [
    {
      key: "Device Details",
      icon: deviceIcon,
      value: {
        browser: "Browser used for the session",
        created_at: "Date when device was first seen",
        device_id: "ID of the device generated by sardine SDK",
        device_reputation: "Reputation of device based on IP address history and fraud feedback data",
        emulator: "If device is a mobile emulator like BlueStacks",
        fingerprint_id: "Fingerprint of the device by Sardine SDK.",
        confidence_score: "Confidence Score of the fingerprint",
        remote_software: "Status of remote desktop active or not. Like TeamViwer, Anydesk, Zoom etc",
        screen_resolution: "Screen resolution of the device",
        rooted: "If device is rooted",
        device_model: "Device model",
        behavior_biometric_level: "Risk level calculated from Behavior biometrics",
        device_age_hours: "Device age in hours from first seen",
      },
    },
    {
      key: "Executed Rules",
      icon: executedRulesIcon,
      value: {},
    },
    {
      key: "Network Details",
      icon: cloudIcon,
      value: {
        ip_address: "The last IP address seen in the session",
        ip_type: "Type of IP like Corporate, Fixed Line ISP",
        vpn: "Whether connection is from VPN",
        proxy: "Whether connection is from Proxy",
        city: "City from IP Address",
        region: "Region from IP Address",
        country: "Country from IP Address",
        location: "Location of the device (Longitude, Latitude)",
      },
    },
    {
      key: "OS Details",
      icon: osIcon,
      value: {
        os: "OS installed in device",
        os_anomaly: "Is  there an anomaly between TrueOS and OS?",
        true_os: "True OS (eg if user use Android emulator on Mac OS, trueOS would be 'Mac/iOS')",
      },
    },
  ];

  window.onpopstate = () => {
    if (listPayload) {
      dispatch({
        type: ActionTypes.FRAUD_SCORE_LIST,
        payload: listPayload as AnyTodo,
      });

      if (listPayload.organisation) {
        setUserStoreOrganisation(listPayload.organisation);
      }

      if (listPayload.dates) {
        dispatch({ type: ActionTypes.CHANGE_SELECTED_DATES_DATA, payload: listPayload.dates });
      }
    }
  };

  if (session_key === "") {
    if (sessionKeyFromQP !== "") {
      setSessionKey(sessionKeyFromQP);
    }
  }

  useEffect(() => {
    function setUpData(d: DeviceProfile) {
      if (d) {
        setUserId(d.user_id_hash);
        setSessionKey(d.session_key || "-");
        setCreatedAt(d.created_at.split(" ")[0] || "");
        setClientID(d.client_id || "");
        setSessionRisk(d.session_risk || "");

        setIsDataLoaded(true);

        const data: DeviceObject[] = definitions.map((def) => {
          const name = def.key;
          const icon = def.icon;
          const value = Object.entries(def.value);
          if (name === "Executed Rules") {
            value.sort();
          }
          const deviceProfile = d as AnyTodo;

          return {
            name,
            icon,
            value: value
              .filter((_d) => deviceProfile[_d[0]] !== undefined)
              .map((_d) => ({
                name: _d[0],
                description: _d[1],
                value: deviceProfile[_d[0]],
              })),
          };
        });

        if (d.behavior_biometrics) {
          setBehaviorBiometrics(d.behavior_biometrics);
        }

        setDeviceData(data);
      }
    }

    async function fetchData() {
      const { result } = await fetchDeviceProfile({
        organisation,
        sessionKey: session_key,
        source: dbSource,
        clientId: clientIdFromQP,
      });
      setIsDataLoaded(true);

      const { hits, profile } = result;

      if (profile) {
        setUpData(profile);
      } else if (hits && Array.isArray(hits.hits)) {
        const data: Array<DeviceProfile> = hits.hits.map((item: DeviceProfileHit) => item._source);
        if (data.length > 0) {
          setUpData(data[0]);
        }
      }
    }

    if (!isDataLoaded) {
      if (details) {
        const d = details.data;

        if (d) {
          if (userId.length === 0) {
            setUpData(d);
          } else if (userId !== d.user_id_hash) {
            fetchData()
              .then()
              .catch((e) => captureException(e));
          }
        }

        if (details.payload) {
          setListPayload(details.payload);
        }
      } else {
        setSessionKey(searchPath.get("session") || "");
        setUserId(searchPath.get("userId") || "");

        // Timeout to set session & user id
        setTimeout(fetchData, 100);
      }
    }
  }, [isDataLoaded]);

  if (isDataLoaded && !deviceData.length) {
    return (
      <HeaderOnlyError
        header={
          <>
            No device data found for the session <div className="text-blue">{sessionKeyFromQP}</div>{" "}
          </>
        }
      />
    );
  }

  return (
    <Layout>
      {isDataLoaded ? (
        <StyledMainDiv>
          <StyledStickyNav
            id="device-info"
            style={{
              width: "inherit",
              margin: 10,
              justifyContent: "space-between",
              display: "flex",
            }}
          >
            <StyledNavTitle style={{ width: "100%" }}>
              <StyledTitleName id="page_title" style={{ fontSize: 20 }}>
                {"< Device Intelligence "}
                <span style={{ fontWeight: "bold" }}>{"/ Device Details"}</span>
              </StyledTitleName>
            </StyledNavTitle>
          </StyledStickyNav>
          <InputGroupWrapper style={{ width: "inherit" }}>
            <div style={{ width: "100%", margin: "10px 10px" }}>
              <DetailsHeaderParent>
                <DetailsHeaderChild>
                  <DetailsHeaderValue id="risk_level_value">
                    <CircularRiskLevel risk_level={sessionRisk} />
                  </DetailsHeaderValue>
                </DetailsHeaderChild>
                <DetailsHeaderParent>
                  <DetailsHeaderChild>
                    <DetailsHeaderTile id="user_id_title">UserID</DetailsHeaderTile>
                    <DetailsHeaderValue id="user_id_value">
                      {userId ? <CustomerProfileLink clientId={clientID} customerId={userId} text={userId} /> : "-"}
                    </DetailsHeaderValue>
                  </DetailsHeaderChild>
                  <DetailsHeaderChild>
                    <DetailsHeaderTile id="session_key_title">Session Key</DetailsHeaderTile>
                    <DetailsHeaderValue id="session_key_value"> {session_key || "-"} </DetailsHeaderValue>
                  </DetailsHeaderChild>
                </DetailsHeaderParent>
              </DetailsHeaderParent>
            </div>
          </InputGroupWrapper>
          <br />
          <PinContainer style={{ marginBottom: 30 }}>
            {deviceData.map((data) => (
              <StyledCard style={{ marginTop: 15 }} key={data.name}>
                <Card.Header id={`header_${data.name}`} style={{ color: "var(--dark-14)" }}>
                  <img src={data.icon} />
                  <span>{data.name}</span>
                </Card.Header>
                {data.name.toLowerCase().includes("rules") ? (
                  <ExecutedRulesList
                    sessionKey={session_key}
                    date={createdAt}
                    clientID={clientID}
                    onClick={(id) => {
                      navigate(`${RULE_DETAILS_PATH}?${PARAM_KEYS.RULE_ID}=${id}&${PARAM_KEYS.CLIENT_ID}=${clientID}`);
                    }}
                  />
                ) : (
                  <Card.Body>
                    {data.value.map((d) => (
                      <div key={d.name} className="grid-view">
                        <OverlayTrigger placement="top" overlay={<Tooltip id={d.name}> {d.description} </Tooltip>}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Card.Title
                              style={{
                                fontSize: 14,
                                marginBottom: 5,
                                textTransform: "capitalize",
                                color: "#ABA69A",
                                fontWeight: "normal",
                              }}
                              className="font-weight-normal"
                              id={`${d.name}_title`}
                            >
                              {replaceAllUnderscoresWithSpaces(d.name)}{" "}
                            </Card.Title>
                          </div>
                        </OverlayTrigger>
                        <div id={`${d.name}_value`} style={{ fontSize: 14, lineBreak: "anywhere" }}>
                          {d.name.includes("location") && Object.entries(d.value).length > 0 ? (
                            <Link
                              id={`link_${d.name}`}
                              href={`https://www.google.com/maps/search/?api=1&query=${d.value.lat},${d.value.lon}`}
                            >
                              <StyledTableCell>
                                <GrLocation />
                                <span>{`${d.value.lat.toFixed(2)}, ${d.value.lon.toFixed(2)}`}</span>
                              </StyledTableCell>
                            </Link>
                          ) : d.name.includes("referrer") ? (
                            <Link id={`link_${d.name}`} href={d.value}>
                              {d.value}
                            </Link>
                          ) : featuresWithLevel.includes(d.name) ? (
                            <Badge title={d.value.toString()} style={{ marginLeft: -10, marginTop: 5 }} />
                          ) : (
                            d.value.toString() || "-"
                          )}{" "}
                        </div>
                      </div>
                    ))}
                    <BorderHide />
                  </Card.Body>
                )}
              </StyledCard>
            ))}
          </PinContainer>
          <BehaviorBiometrics behavior_biometrics={behaviorBiometrics} />
        </StyledMainDiv>
      ) : (
        <Loader />
      )}
    </Layout>
  );
};

export default DeviceView;
