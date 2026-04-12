module handshake_sva(
    input logic clk_i,
    input logic req_i,
    input logic ack_o
);
    property req_ack;
        @(posedge clk_i) req_i |-> ack_o;
    endproperty

    assert property (req_ack);
endmodule
